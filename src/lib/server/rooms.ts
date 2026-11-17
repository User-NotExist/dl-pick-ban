import { HERO_IDS } from '../hero-ids';
import {
	DEFAULT_FORMAT,
	DEFAULT_TURN_SECONDS,
	FLIP_COIN_S,
	FLIP_REVEAL_DELAY_S,
	FORMATS,
	RANDOM_HERO,
	RANDOM_ROLL_S,
	TEAM_SIZE,
	TURN_GRACE_S,
	TURN_TIME_OPTIONS,
	type Action,
	type Ban,
	type Format,
	type LastEvent,
	type Phase,
	type Player,
	type RoomState,
	type Team,
	type Turn
} from '../types';

const MAX_PLAYERS = 12;
/** players plus spectators */
const MAX_IN_ROOM = 30;
const MAX_ROOMS = 2000;
/** fake players the host may add to one room */
const MAX_FAKES = 12;
/** open tabs (event streams) one member may have in a room */
const MAX_CONNECTIONS_PER_MEMBER = 5;
/** stream pages attached to one room */
const MAX_OBSERVERS = 5;
/** the `you` of a snapshot made for a stream page, which is not a member of the room */
const OBSERVER = '';
const EMPTY_ROOM_TTL = 30 * 60 * 1000;
/** a room nobody has entered yet is dropped much sooner */
const NEW_ROOM_TTL = 5 * 60 * 1000;
/** how long the host may be disconnected before someone else takes over */
const HOST_GRACE = 15 * 1000;
/** how long an offline member without a seat is kept */
const SPECTATOR_TTL = 30 * 1000;
const KICK_COOLDOWN = 10 * 1000;
const HEROES = new Set<string>(HERO_IDS);

interface Member extends Omit<Player, 'online'> {
	token: string;
	/** hero selected but not confirmed, and when (for ordering) */
	selection: string | null;
	selectedAt: number;
	connections: number;
	/** joined while a draft was running: as a spectator, does not see unconfirmed selections */
	late: boolean;
	dropTimer: Timer | null;
}

type Timer = ReturnType<typeof setTimeout>;

export type Listener = (event: 'state' | 'kicked', state: RoomState | null) => void;

export interface Room {
	code: string;
	phase: Phase;
	hostId: string;
	format: Format;
	members: Member[];
	bans: Ban[];
	/** coin-flip winner: goes first */
	firstPick: Team | null;
	/**
	 * The turns of the draft in order, as far as they are known: everything that depends on the
	 * coin flip is added when it is made.
	 */
	steps: Turn[];
	/** index into `steps` of the turn in progress */
	step: number;
	last: LastEvent | null;
	seq: number;
	flipTimer: Timer | null;
	/** time limit per turn in seconds; 0 means no limit */
	turnSeconds: number;
	/** identifies the turn the clock is running for, so it restarts only when the turn changes */
	turnKey: string | null;
	turnTimer: Timer | null;
	/** when the current turn times out (epoch ms), or null when no clock is running */
	turnDeadline: number | null;
	listeners: Map<Listener, string>;
	/** secret in the stream page's link; only the host is told it */
	streamKey: string;
	/** stream pages: they receive every snapshot but are not members and do not keep the room alive */
	observers: Set<Listener>;
	expiry: Timer | null;
	/** runs while the host is disconnected; when it fires the host role moves on */
	hostTimer: Timer | null;
	/** token -> time until which a kicked player may not rejoin */
	kicked: Map<string, number>;
}

export class RoomError extends Error {}

// survive dev-server module reloads
const g = globalThis as { __pickbanRooms?: Map<string, Room> };
const rooms = (g.__pickbanRooms ??= new Map<string, Room>());

const other = (t: Team): Team => (t === 'A' ? 'B' : 'A');
const randomId = () => crypto.randomUUID().replaceAll('-', '').slice(0, 12);

const unref = (t: Timer) => (t as { unref?: () => void }).unref?.();

function randomCode() {
	const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
	let code = '';
	for (const n of crypto.getRandomValues(new Uint32Array(5))) code += alphabet[n % alphabet.length];
	return code;
}

export function cleanName(name: unknown): string {
	if (typeof name !== 'string') throw new RoomError('Username is required');
	const n = name.trim().replace(/\s+/g, ' ').slice(0, 20);
	if (!n) throw new RoomError('Username is required');
	return n;
}

export function createRoom(): Room {
	// also keeps the loop below short: the code space is never more than a sliver full
	if (rooms.size >= MAX_ROOMS)
		throw new RoomError('The server is busy. Try again in a few minutes.');
	let code = randomCode();
	while (rooms.has(code)) code = randomCode();
	const room: Room = {
		code,
		phase: 'lobby',
		hostId: '',
		format: DEFAULT_FORMAT,
		members: [],
		bans: [],
		firstPick: null,
		steps: [],
		step: 0,
		flipTimer: null,
		turnSeconds: DEFAULT_TURN_SECONDS,
		turnKey: null,
		turnTimer: null,
		turnDeadline: null,
		last: null,
		seq: 0,
		listeners: new Map(),
		streamKey: crypto.randomUUID().replaceAll('-', ''),
		observers: new Set(),
		expiry: null,
		hostTimer: null,
		kicked: new Map()
	};
	rooms.set(code, room);
	scheduleExpiry(room, NEW_ROOM_TTL);
	return room;
}

export function getRoom(code: string): Room | undefined {
	return rooms.get(code.toUpperCase());
}

function scheduleExpiry(room: Room, ttl = EMPTY_ROOM_TTL) {
	if (room.expiry) clearTimeout(room.expiry);
	room.expiry = setTimeout(() => {
		if (room.listeners.size > 0) return;
		rooms.delete(room.code);
		if (room.flipTimer) clearTimeout(room.flipTimer);
		if (room.turnTimer) clearTimeout(room.turnTimer);
		if (room.hostTimer) clearTimeout(room.hostTimer);
		for (const m of room.members) if (m.dropTimer) clearTimeout(m.dropTimer);
		for (const listener of [...room.observers]) listener('kicked', null);
		room.observers.clear();
	}, ttl);
	unref(room.expiry);
}

export function currentTurn(room: Room): Turn | null {
	if (room.phase !== 'ban' && room.phase !== 'pick') return null;
	return room.steps[room.step] ?? null;
}

export function snapshot(room: Room, you: string): RoomState {
	const turn = currentTurn(room);
	const viewer = room.members.find((m) => m.id === you);
	// the opposing team must not see what is being considered, and neither must a spectator who
	// turned up mid-draft (otherwise a player could just open the room a second time)
	// The stream page sees everything: its link is a secret only the host has.
	const seesAll =
		!!turn &&
		(you === OBSERVER ||
			(!!viewer && (viewer.team === turn.team || (viewer.team === null && !viewer.late))));
	const selections = room.members
		.filter((m) => m.selection && (seesAll || m.id === you))
		.sort((a, b) => a.selectedAt - b.selectedAt)
		.map((m) => ({ playerId: m.id, hero: m.selection as string }));
	return {
		code: room.code,
		phase: room.phase,
		hostId: room.hostId,
		format: room.format,
		players: room.members.map(({ id, name, team, slot, hero, connections, fake }) => ({
			id,
			name,
			team,
			slot,
			hero,
			// a fake player never connects, which is what lets the host act for them
			online: connections > 0,
			fake
		})),
		bans: room.bans,
		bansPerTeam: bansPerTeam(room),
		turn,
		last: room.last,
		firstPick: room.firstPick,
		// kept back during the flip so the seat numbers do not give the result away early
		pickOrder:
			room.phase === 'flip'
				? []
				: room.steps.flatMap((s) => (s.type === 'pick' ? [s.playerId] : [])),
		selections,
		turnSeconds: room.turnSeconds,
		turnEndsIn: room.turnDeadline === null ? null : Math.max(0, room.turnDeadline - Date.now()),
		streamKey: you !== OBSERVER && you === room.hostId ? room.streamKey : null,
		you
	};
}

export function broadcast(room: Room) {
	for (const [listener, id] of room.listeners) listener('state', snapshot(room, id));
	if (room.observers.size) {
		const state = snapshot(room, OBSERVER);
		for (const listener of room.observers) listener('state', state);
	}
}

/** Attach a stream page: it is sent every snapshot, selections included, without joining the room. */
export function observe(room: Room, key: string, listener: Listener): () => void {
	if (key.length !== room.streamKey.length || key !== room.streamKey)
		throw new RoomError('This stream link is not valid');
	if (room.observers.size >= MAX_OBSERVERS)
		throw new RoomError('This room has too many stream pages open');
	room.observers.add(listener);
	listener('state', snapshot(room, OBSERVER));
	return () => room.observers.delete(listener);
}

export function isMember(room: Room, token: string): boolean {
	return room.members.some((m) => !m.fake && m.token === token);
}

/** Find the member for this token, creating a seat (unassigned) if new. */
export function join(room: Room, token: string, name: string): Member {
	if (typeof token !== 'string' || token.length < 8 || token.length > 64)
		throw new RoomError('Invalid session');
	const until = room.kicked.get(token);
	if (until) {
		const wait = Math.ceil((until - Date.now()) / 1000);
		if (wait > 0)
			throw new RoomError(
				`You were removed from this room. You can rejoin in ${wait} second${wait === 1 ? '' : 's'}.`
			);
		room.kicked.delete(token);
	}
	let m = room.members.find((x) => !x.fake && x.token === token);
	if (m) {
		if (m.connections >= MAX_CONNECTIONS_PER_MEMBER)
			throw new RoomError('You have this room open in too many tabs');
		m.name = name;
	} else {
		if (room.members.length >= MAX_IN_ROOM) throw new RoomError('Room is full');
		m = {
			id: randomId(),
			token,
			name,
			team: null,
			slot: null,
			hero: null,
			fake: false,
			connections: 0,
			selection: null,
			selectedAt: 0,
			late: room.phase !== 'lobby',
			dropTimer: null
		};
		room.members.push(m);
	}
	if (!room.members.some((x) => x.id === room.hostId)) room.hostId = m.id;
	return m;
}

const hostOnline = (room: Room) =>
	room.members.some((m) => m.id === room.hostId && m.connections > 0);

/** Give the host role to the first online member, if the host is not online. */
function handOver(room: Room): boolean {
	if (hostOnline(room)) return false;
	const next = room.members.find((m) => m.connections > 0);
	if (!next) return false;
	room.hostId = next.id;
	return true;
}

function removeMember(room: Room, m: Member) {
	if (m.dropTimer) clearTimeout(m.dropTimer);
	m.dropTimer = null;
	room.members = room.members.filter((x) => x !== m);
	if (room.hostId === m.id) {
		room.hostId = '';
		handOver(room);
	}
}

/** An offline member without a seat is forgotten after a while, so rooms cannot be stuffed. */
function scheduleDrop(room: Room, m: Member) {
	if (m.dropTimer) clearTimeout(m.dropTimer);
	m.dropTimer = null;
	// a fake player is never online and stays until the host removes them
	if (m.fake) return;
	if (m.connections > 0 || m.team !== null || !room.members.includes(m)) return;
	m.dropTimer = setTimeout(() => {
		m.dropTimer = null;
		if (m.connections > 0 || m.team !== null || !room.members.includes(m)) return;
		removeMember(room, m);
		broadcast(room);
	}, SPECTATOR_TTL);
	unref(m.dropTimer);
}

export function subscribe(room: Room, member: Member, listener: Listener): () => void {
	room.listeners.set(listener, member.id);
	member.connections++;
	if (member.dropTimer) clearTimeout(member.dropTimer);
	member.dropTimer = null;
	if (room.expiry) {
		clearTimeout(room.expiry);
		room.expiry = null;
	}
	if (member.id === room.hostId) {
		// the host is back within the grace period and keeps the role
		if (room.hostTimer) clearTimeout(room.hostTimer);
		room.hostTimer = null;
	} else if (!room.hostTimer) {
		// the grace period ran out while nobody was around to take over
		handOver(room);
	}
	broadcast(room);

	let done = false;
	return () => {
		if (done) return;
		done = true;
		room.listeners.delete(listener);
		member.connections = Math.max(0, member.connections - 1);
		if (member.connections === 0) {
			if (room.hostId === member.id) {
				// a refresh or a network blip must not cost the host the role: wait before passing it on
				if (room.hostTimer) clearTimeout(room.hostTimer);
				room.hostTimer = setTimeout(() => {
					room.hostTimer = null;
					if (handOver(room)) broadcast(room);
				}, HOST_GRACE);
				unref(room.hostTimer);
			}
			scheduleDrop(room, member);
		}
		if (room.listeners.size === 0) scheduleExpiry(room);
		broadcast(room);
	};
}

/** team members in seat order (lane by lane), which is also the pick order */
const teamOf = (room: Room, team: Team) =>
	room.members.filter((m) => m.team === team).sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0));

/** Casual opens with these bans, before the coin flip. */
const CASUAL_BANS: Team[] = ['A', 'B', 'A', 'B'];
/** Night Shift, start to finish; `A` is the coin-flip winner. */
const NIGHT_SHIFT = [
	['ban', 'ABAB'],
	['pick', 'ABBABA'],
	['ban', 'BA'],
	['pick', 'BAABAB']
] as const;
/** picks each team has made when Night Shift reaches its second ban phase */
const NIGHT_SHIFT_FIRST_PICKS = 3;

/** Ban slots per team. Night Shift drops its second ban phase when no picks would follow it. */
function bansPerTeam(room: Room): number {
	if (room.format === 'casual') return CASUAL_BANS.length / 2;
	const late = Math.max(teamOf(room, 'A').length, teamOf(room, 'B').length) > NIGHT_SHIFT_FIRST_PICKS;
	return late ? 3 : 2;
}

/**
 * The turns that follow the coin flip. Within a team players pick in seat order. A pick turn
 * for a team with nobody left is skipped, so uneven and short teams still work.
 *
 * Casual: only picks are left. The first team picks once, then the teams alternate with two
 * picks each, so the first team also gets the last single pick (A, B B, A A, B B, ..., A).
 */
function buildSteps(room: Room, first: Team): Turn[] {
	const queue = { A: teamOf(room, 'A'), B: teamOf(room, 'B') };
	const steps: Turn[] = [];
	const pick = (team: Team) => {
		const next = queue[team].shift();
		if (next) steps.push({ type: 'pick', team, playerId: next.id });
	};
	if (room.format === 'casual') {
		for (let pos = 0; queue.A.length || queue.B.length; pos++)
			pick(Math.floor((pos + 1) / 2) % 2 === 0 ? first : other(first));
		return steps;
	}
	for (const [type, order] of NIGHT_SHIFT) {
		// bans with no picks left to follow them are pointless
		if (type === 'ban' && !queue.A.length && !queue.B.length) continue;
		for (const side of order) {
			const team = side === 'A' ? first : other(first);
			if (type === 'ban') steps.push({ type, team });
			else pick(team);
		}
	}
	return steps;
}

function freeSlots(room: Room, team: Team, except?: Member): number[] {
	const taken = new Set(teamOf(room, team).filter((m) => m !== except).map((m) => m.slot));
	return Array.from({ length: TEAM_SIZE }, (_, i) => i).filter((i) => !taken.has(i));
}

function shuffled<T>(items: T[]): T[] {
	const out = [...items];
	for (let i = out.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[out[i], out[j]] = [out[j], out[i]];
	}
	return out;
}

function heroTaken(room: Room, hero: string) {
	return room.bans.some((b) => b.hero === hero) || room.members.some((m) => m.hero === hero);
}

function randomHero(room: Room): string {
	const free = HERO_IDS.filter((h) => !heroTaken(room, h));
	if (!free.length) throw new RoomError('No heroes are left');
	return free[Math.floor(Math.random() * free.length)];
}

/**
 * Flip the coin for who goes first and hold the draft in the `flip` phase while clients play
 * the animation, so nobody can act before the coin has landed.
 */
function startFlip(room: Room) {
	room.firstPick = Math.random() < 0.5 ? 'A' : 'B';
	room.steps.push(...buildSteps(room, room.firstPick));
	room.phase = 'flip';
	room.flipTimer = setTimeout(
		() => {
			finishFlip(room);
			syncTurnTimer(room);
			broadcast(room);
		},
		// clients let the reveal of a ban made just before the flip play out first
		((room.last ? FLIP_REVEAL_DELAY_S : 0) + FLIP_COIN_S) * 1000
	);
	unref(room.flipTimer);
}

export function finishFlip(room: Room) {
	if (room.flipTimer) clearTimeout(room.flipTimer);
	room.flipTimer = null;
	if (room.phase === 'flip') room.phase = room.steps[room.step]?.type ?? 'done';
}

/** The turn in progress has been taken: move on to the next one, the coin flip, or the end. */
function advance(room: Room) {
	room.step++;
	const next = room.steps[room.step];
	if (next) room.phase = next.type;
	else if (room.firstPick === null) startFlip(room);
	else room.phase = 'done';
}

function clearSelections(room: Room) {
	for (const m of room.members) m.selection = null;
}

/** Record a ban; `hero` is null when the team ran out of time with nothing selected. */
function applyBan(room: Room, team: Team, hero: string | null) {
	room.bans.push({ team, hero });
	room.last = { seq: ++room.seq, type: 'ban', team, hero, player: null, random: false };
	clearSelections(room);
	advance(room);
}

/** `random`: the server rolled the hero, so clients play the roulette before the reveal */
function applyPick(room: Room, picker: Member, hero: string, random = false) {
	if (!picker.team) return;
	picker.hero = hero;
	room.last = { seq: ++room.seq, type: 'pick', team: picker.team, hero, player: picker.name, random };
	clearSelections(room);
	advance(room);
}

/** The player due to pick, if `me` may act for that turn: the picker, or the host while the picker is offline. */
function requirePicker(room: Room, me: Member): Member {
	const turn = currentTurn(room);
	if (turn?.type !== 'pick') throw new RoomError('Not in the pick phase');
	const picker = room.members.find((m) => m.id === turn.playerId);
	if (!picker) throw new RoomError('Nobody is due to pick');
	// the host may pick for a disconnected player so the draft cannot get stuck
	if (picker !== me && (room.hostId !== me.id || picker.connections > 0))
		throw new RoomError('It is not your turn to pick');
	return picker;
}

/**
 * Whether `m` may ban for `team`: its own members, and the host when the whole team is fake
 * players (a team with a real player on it bans for itself).
 */
function bansFor(room: Room, m: Member, team: Team): boolean {
	if (m.team === team) return true;
	const players = teamOf(room, team);
	return room.hostId === m.id && players.length > 0 && players.every((p) => p.fake);
}

/** A selected hero that is still up for grabs, or null (also for the random card). */
const validSelection = (room: Room, m: Member | undefined) =>
	m?.selection && m.selection !== RANDOM_HERO && !heroTaken(room, m.selection)
		? m.selection
		: null;

/**
 * The turn ran out of time. A selected hero is locked in; with nothing selected a ban is
 * forfeited and a pick falls to a random hero.
 */
function timeOut(room: Room) {
	const turn = currentTurn(room);
	if (!turn) return;
	if (turn.type === 'ban') {
		// every teammate's selection counts in a ban (and the host's, for a team of fake
		// players): the most recent one wins
		const latest = room.members
			.filter((m) => bansFor(room, m, turn.team) && validSelection(room, m))
			.sort((a, b) => b.selectedAt - a.selectedAt)[0];
		applyBan(room, turn.team, validSelection(room, latest));
		return;
	}
	const picker = room.members.find((m) => m.id === turn.playerId);
	if (!picker) return;
	// while the picker is offline the host's selection stands in for theirs
	const lead =
		picker.connections > 0 ? picker : room.members.find((m) => m.id === room.hostId);
	const selected = validSelection(room, lead);
	if (selected) applyPick(room, picker, selected);
	else applyPick(room, picker, randomHero(room), true);
}

/** Start, restart or stop the turn clock so that it matches the turn now in progress. */
function syncTurnTimer(room: Room) {
	const key = currentTurn(room)
		? `${room.phase}:${room.bans.length}:${room.members.filter((m) => m.hero).length}`
		: null;
	if (key === room.turnKey) return;
	room.turnKey = key;
	if (room.turnTimer) clearTimeout(room.turnTimer);
	room.turnTimer = null;
	room.turnDeadline = null;
	if (!key || room.turnSeconds <= 0) return;
	// a random pick plays its roulette before the reveal: the next turn waits for both
	const ms = (room.turnSeconds + TURN_GRACE_S + (room.last?.random ? RANDOM_ROLL_S : 0)) * 1000;
	room.turnDeadline = Date.now() + ms;
	room.turnTimer = setTimeout(() => {
		room.turnTimer = null;
		try {
			timeOut(room);
		} catch {
			// nothing sensible to lock in; the turn stays open without a clock
		}
		syncTurnTimer(room);
		broadcast(room);
	}, ms);
	unref(room.turnTimer);
}

function requireHost(room: Room, m: Member) {
	if (room.hostId !== m.id) throw new RoomError('Only the host can do that');
}

function requireHero(room: Room, hero: unknown): string {
	if (typeof hero !== 'string' || !HEROES.has(hero)) throw new RoomError('Unknown hero');
	if (heroTaken(room, hero)) throw new RoomError('That hero is no longer available');
	return hero;
}

export function act(room: Room, token: string, action: Action) {
	const me = room.members.find((m) => !m.fake && m.token === token);
	if (!me) throw new RoomError('You are not in this room');

	switch (action.type) {
		case 'setTeam': {
			if (room.phase !== 'lobby') throw new RoomError('Teams are locked during the draft');
			const team = action.team;
			if (team !== null && team !== 'A' && team !== 'B') throw new RoomError('Invalid team');
			if (!team) {
				me.team = null;
				me.slot = null;
				scheduleDrop(room, me); // actions do not need an open connection
				break;
			}
			const free = freeSlots(room, team, me);
			let slot = action.slot;
			if (slot === undefined) {
				if (me.team === team) break; // already seated here
				if (!free.length) throw new RoomError('That team is full');
				slot = free[0];
			} else if (!Number.isInteger(slot) || slot < 0 || slot >= TEAM_SIZE) {
				throw new RoomError('Invalid lane slot');
			} else if (!free.includes(slot)) {
				throw new RoomError('That lane slot is taken');
			}
			me.team = team;
			me.slot = slot;
			break;
		}
		case 'move': {
			requireHost(room, me);
			if (room.phase !== 'lobby') throw new RoomError('Teams are locked during the draft');
			const target = room.members.find((m) => m.id === action.id);
			if (!target) throw new RoomError('Player not found');
			const { team, slot } = action;
			if (team === null) {
				target.team = null;
				target.slot = null;
				scheduleDrop(room, target);
				break;
			}
			if (team !== 'A' && team !== 'B') throw new RoomError('Invalid team');
			if (typeof slot !== 'number' || !Number.isInteger(slot) || slot < 0 || slot >= TEAM_SIZE)
				throw new RoomError('Invalid lane slot');
			// an occupied slot swaps: its player takes the moved player's old place
			const occupant = room.members.find((m) => m.team === team && m.slot === slot);
			if (occupant && occupant !== target) {
				occupant.team = target.team;
				occupant.slot = target.slot;
				scheduleDrop(room, occupant);
			}
			target.team = team;
			target.slot = slot;
			scheduleDrop(room, target); // seated now: cancels a pending removal
			break;
		}
		case 'shuffle': {
			requireHost(room, me);
			if (room.phase !== 'lobby') throw new RoomError('Teams are locked during the draft');
			// only seated players are shuffled; spectators stay spectators
			const first: Team = Math.random() < 0.5 ? 'A' : 'B';
			const slots = { A: shuffled([0, 1, 2, 3, 4, 5]), B: shuffled([0, 1, 2, 3, 4, 5]) };
			shuffled(room.members.filter((m) => m.team)).forEach((m, i) => {
				m.team = i >= MAX_PLAYERS ? null : i % 2 === 0 ? first : other(first);
				m.slot = m.team ? (slots[m.team].pop() ?? null) : null;
				scheduleDrop(room, m);
			});
			break;
		}
		case 'start': {
			requireHost(room, me);
			if (room.phase !== 'lobby') throw new RoomError('Draft already started');
			const a = teamOf(room, 'A').length;
			const b = teamOf(room, 'B').length;
			if (a < 1 || b < 1) throw new RoomError('Each team needs at least one player');
			if (a > TEAM_SIZE || b > TEAM_SIZE) throw new RoomError('Teams are limited to 6 players');
			room.bans = [];
			for (const m of room.members) m.hero = null;
			room.firstPick = null;
			room.steps = [];
			room.step = 0;
			room.last = null;
			clearSelections(room);
			if (room.format === 'casual') {
				room.steps = CASUAL_BANS.map((team) => ({ type: 'ban', team }));
				room.phase = 'ban';
			} else {
				startFlip(room);
			}
			break;
		}
		case 'select': {
			const turn = currentTurn(room);
			if (!turn) throw new RoomError('No draft in progress');
			const picker =
				turn.type === 'pick' ? room.members.find((m) => m.id === turn.playerId) : undefined;
			const proxy = !!picker && room.hostId === me.id && picker.connections === 0;
			const allowed =
				turn.type === 'ban' ? bansFor(room, me, turn.team) : me.team === turn.team || proxy;
			if (!allowed) throw new RoomError("It is not your team's turn");
			// the random card can be marked like a hero, but only bans name a hero outright
			me.selection =
				action.hero === null || (action.hero === RANDOM_HERO && turn.type === 'pick')
					? action.hero
					: requireHero(room, action.hero);
			me.selectedAt = ++room.seq;
			break;
		}
		case 'ban': {
			const turn = currentTurn(room);
			if (turn?.type !== 'ban') throw new RoomError('Not in the ban phase');
			if (!bansFor(room, me, turn.team)) throw new RoomError("It is not your team's turn");
			applyBan(room, turn.team, requireHero(room, action.hero));
			break;
		}
		case 'pick': {
			const picker = requirePicker(room, me);
			if (action.hero === RANDOM_HERO) applyPick(room, picker, randomHero(room), true);
			else applyPick(room, picker, requireHero(room, action.hero));
			break;
		}
		case 'setTimer': {
			requireHost(room, me);
			if (room.phase !== 'lobby')
				throw new RoomError('The timer can only be changed in the lobby');
			if (!(TURN_TIME_OPTIONS as readonly number[]).includes(action.seconds))
				throw new RoomError('Invalid time limit');
			room.turnSeconds = action.seconds;
			break;
		}
		case 'setFormat': {
			requireHost(room, me);
			if (room.phase !== 'lobby')
				throw new RoomError('The format can only be changed in the lobby');
			if (!FORMATS.some((f) => f.id === action.format)) throw new RoomError('Invalid format');
			room.format = action.format;
			break;
		}
		case 'reset': {
			requireHost(room, me);
			finishFlip(room);
			room.phase = 'lobby';
			room.firstPick = null;
			room.steps = [];
			room.step = 0;
			room.last = null;
			clearSelections(room);
			room.bans = [];
			for (const m of room.members) {
				m.hero = null;
				// everyone present will have been here from the start of the next draft
				m.late = false;
			}
			break;
		}
		case 'kick': {
			requireHost(room, me);
			if (room.phase !== 'lobby') throw new RoomError('Players can only be removed in the lobby');
			const target = room.members.find((m) => m.id === action.id);
			if (!target || target.id === me.id) throw new RoomError('Cannot remove that player');
			removeMember(room, target);
			const now = Date.now();
			for (const [t, until] of room.kicked) if (until <= now) room.kicked.delete(t);
			if (!target.fake) room.kicked.set(target.token, now + KICK_COOLDOWN);
			for (const [listener, id] of [...room.listeners]) {
				if (id === target.id) {
					room.listeners.delete(listener);
					listener('kicked', null);
				}
			}
			break;
		}
		case 'addFake': {
			requireHost(room, me);
			if (room.phase !== 'lobby')
				throw new RoomError('Fake players can only be added in the lobby');
			const name = cleanName(action.name);
			if (room.members.length >= MAX_IN_ROOM) throw new RoomError('Room is full');
			if (room.members.filter((m) => m.fake).length >= MAX_FAKES)
				throw new RoomError(`A room can have at most ${MAX_FAKES} fake players`);
			// seated on the smaller team (a coin flip when they are level), or left a spectator
			// when both are full
			const open = (['A', 'B'] as const)
				.map((team) => ({ team, free: freeSlots(room, team) }))
				.filter((t) => t.free.length > 0)
				.sort((x, y) => y.free.length - x.free.length || Math.random() - 0.5);
			const seat = open[0];
			room.members.push({
				id: randomId(),
				// never handed out, so no request can act as this member; only the host acts for it
				token: crypto.randomUUID(),
				name,
				team: seat?.team ?? null,
				slot: seat?.free[0] ?? null,
				hero: null,
				fake: true,
				connections: 0,
				selection: null,
				selectedAt: 0,
				late: false,
				dropTimer: null
			});
			break;
		}
		default:
			throw new RoomError('Unknown action');
	}
	syncTurnTimer(room);
	broadcast(room);
}
