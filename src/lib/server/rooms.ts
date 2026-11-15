import { HERO_IDS } from '../hero-ids';
import {
	BANS_PER_TEAM,
	FLIP_COIN_S,
	FLIP_REVEAL_DELAY_S,
	TEAM_SIZE,
	type Action,
	type Ban,
	type LastEvent,
	type Phase,
	type Player,
	type RoomState,
	type Team,
	type Turn
} from '../types';

const MAX_PLAYERS = 12;
const MAX_IN_ROOM = 100;
const EMPTY_ROOM_TTL = 30 * 60 * 1000;
const HEROES = new Set<string>(HERO_IDS);

interface Member extends Omit<Player, 'online'> {
	token: string;
	/** hero selected but not confirmed, and when (for ordering) */
	selection: string | null;
	selectedAt: number;
	connections: number;
}

export type Listener = (event: 'state' | 'kicked', state: RoomState | null) => void;

export interface Room {
	code: string;
	phase: Phase;
	hostId: string;
	members: Member[];
	bans: Ban[];
	/** coin-flip winner: picks first and last */
	firstPick: Team | null;
	/** member ids in pick order, fixed when the draft starts */
	pickOrder: string[];
	last: LastEvent | null;
	seq: number;
	flipTimer: ReturnType<typeof setTimeout> | null;
	listeners: Map<Listener, string>;
	expiry: ReturnType<typeof setTimeout> | null;
}

export class RoomError extends Error {}

// survive dev-server module reloads
const g = globalThis as { __pickbanRooms?: Map<string, Room> };
const rooms = (g.__pickbanRooms ??= new Map<string, Room>());

const other = (t: Team): Team => (t === 'A' ? 'B' : 'A');
const randomId = () => crypto.randomUUID().replaceAll('-', '').slice(0, 12);

function randomCode() {
	const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
	let code = '';
	for (let i = 0; i < 5; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
	return code;
}

export function cleanName(name: unknown): string {
	if (typeof name !== 'string') throw new RoomError('Username is required');
	const n = name.trim().replace(/\s+/g, ' ').slice(0, 20);
	if (!n) throw new RoomError('Username is required');
	return n;
}

export function createRoom(): Room {
	let code = randomCode();
	while (rooms.has(code)) code = randomCode();
	const room: Room = {
		code,
		phase: 'lobby',
		hostId: '',
		members: [],
		bans: [],
		firstPick: null,
		pickOrder: [],
		flipTimer: null,
		last: null,
		seq: 0,
		listeners: new Map(),
		expiry: null
	};
	rooms.set(code, room);
	scheduleExpiry(room);
	return room;
}

export function getRoom(code: string): Room | undefined {
	return rooms.get(code.toUpperCase());
}

function scheduleExpiry(room: Room) {
	if (room.expiry) clearTimeout(room.expiry);
	room.expiry = setTimeout(() => {
		if (room.listeners.size === 0) rooms.delete(room.code);
	}, EMPTY_ROOM_TTL);
	(room.expiry as { unref?: () => void }).unref?.();
}

export function currentTurn(room: Room): Turn | null {
	if (room.phase === 'ban') return { type: 'ban', team: room.bans.length % 2 === 0 ? 'A' : 'B' };
	if (room.phase === 'pick') {
		const picker = nextPicker(room);
		if (picker?.team) return { type: 'pick', team: picker.team, playerId: picker.id };
	}
	return null;
}

export function snapshot(room: Room, you: string): RoomState {
	const turn = currentTurn(room);
	const viewer = room.members.find((m) => m.id === you);
	// the opposing team must not see what is being considered
	const seesAll = !!turn && !!viewer && (viewer.team === null || viewer.team === turn.team);
	const selections = room.members
		.filter((m) => m.selection && (seesAll || m.id === you))
		.sort((a, b) => a.selectedAt - b.selectedAt)
		.map((m) => ({ playerId: m.id, hero: m.selection as string }));
	return {
		code: room.code,
		phase: room.phase,
		hostId: room.hostId,
		players: room.members.map(({ id, name, team, slot, hero, connections }) => ({
			id,
			name,
			team,
			slot,
			hero,
			online: connections > 0
		})),
		bans: room.bans,
		turn,
		last: room.last,
		firstPick: room.firstPick,
		// kept back during the flip so the seat numbers do not give the result away early
		pickOrder: room.phase === 'flip' ? [] : room.pickOrder,
		selections,
		you
	};
}

export function broadcast(room: Room) {
	for (const [listener, id] of room.listeners) listener('state', snapshot(room, id));
}

/** Find the member for this token, creating a seat (unassigned) if new. */
export function join(room: Room, token: string, name: string): Member {
	if (typeof token !== 'string' || token.length < 8) throw new RoomError('Invalid session');
	let m = room.members.find((x) => x.token === token);
	if (m) {
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
			connections: 0,
			selection: null,
			selectedAt: 0
		};
		room.members.push(m);
	}
	if (!room.members.some((x) => x.id === room.hostId)) room.hostId = m.id;
	return m;
}

export function subscribe(room: Room, member: Member, listener: Listener): () => void {
	room.listeners.set(listener, member.id);
	member.connections++;
	if (room.expiry) {
		clearTimeout(room.expiry);
		room.expiry = null;
	}
	// if the host is away in the lobby, the newcomer takes over
	const host = room.members.find((x) => x.id === room.hostId);
	if (!host || host.connections === 0) room.hostId = member.id;
	broadcast(room);

	let done = false;
	return () => {
		if (done) return;
		done = true;
		room.listeners.delete(listener);
		member.connections = Math.max(0, member.connections - 1);
		if (member.connections === 0 && room.hostId === member.id) {
			const next = room.members.find((x) => x.connections > 0);
			if (next) room.hostId = next.id;
		}
		if (room.listeners.size === 0) scheduleExpiry(room);
		broadcast(room);
	};
}

/** team members in seat order (lane by lane), which is also the pick order */
const teamOf = (room: Room, team: Team) =>
	room.members.filter((m) => m.team === team).sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0));
const nextPicker = (room: Room) =>
	room.pickOrder.map((id) => room.members.find((m) => m.id === id)).find((m) => m && !m.hero);

/**
 * Pick order: the first team picks once, then the teams alternate with two picks each, so
 * the first team also gets the last single pick (A, B B, A A, B B, ..., A). Within a team
 * players go in seat order. A team with nobody left is skipped, so uneven teams still work.
 */
function buildPickOrder(room: Room, first: Team): string[] {
	const queue = { A: teamOf(room, 'A'), B: teamOf(room, 'B') };
	const order: string[] = [];
	for (let pos = 0; queue.A.length || queue.B.length; pos++) {
		const team = Math.floor((pos + 1) / 2) % 2 === 0 ? first : other(first);
		const next = queue[team].shift();
		if (next) order.push(next.id);
	}
	return order;
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

/**
 * After the last ban: flip the coin for first pick and hold the draft in the `flip` phase
 * while clients play the animation, so nobody can pick before the coin has landed.
 */
function startFlip(room: Room) {
	room.firstPick = Math.random() < 0.5 ? 'A' : 'B';
	room.pickOrder = buildPickOrder(room, room.firstPick);
	room.phase = 'flip';
	room.flipTimer = setTimeout(
		() => {
			finishFlip(room);
			broadcast(room);
		},
		(FLIP_REVEAL_DELAY_S + FLIP_COIN_S) * 1000
	);
	(room.flipTimer as { unref?: () => void }).unref?.();
}

export function finishFlip(room: Room) {
	if (room.flipTimer) clearTimeout(room.flipTimer);
	room.flipTimer = null;
	if (room.phase === 'flip') room.phase = 'pick';
}

function clearSelections(room: Room) {
	for (const m of room.members) m.selection = null;
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
	const me = room.members.find((m) => m.token === token);
	if (!me) throw new RoomError('You are not in this room');

	switch (action.type) {
		case 'setTeam': {
			if (room.phase !== 'lobby') throw new RoomError('Teams are locked during the draft');
			const team = action.team;
			if (team !== null && team !== 'A' && team !== 'B') throw new RoomError('Invalid team');
			if (!team) {
				me.team = null;
				me.slot = null;
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
			}
			target.team = team;
			target.slot = slot;
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
			room.pickOrder = [];
			room.last = null;
			clearSelections(room);
			room.phase = 'ban';
			break;
		}
		case 'select': {
			const turn = currentTurn(room);
			if (!turn) throw new RoomError('No draft in progress');
			const picker =
				turn.type === 'pick' ? room.members.find((m) => m.id === turn.playerId) : undefined;
			const proxy = !!picker && room.hostId === me.id && picker.connections === 0;
			if (me.team !== turn.team && !proxy) throw new RoomError("It is not your team's turn");
			me.selection = action.hero === null ? null : requireHero(room, action.hero);
			me.selectedAt = ++room.seq;
			break;
		}
		case 'ban': {
			const turn = currentTurn(room);
			if (turn?.type !== 'ban') throw new RoomError('Not in the ban phase');
			if (me.team !== turn.team) throw new RoomError("It is not your team's turn");
			const hero = requireHero(room, action.hero);
			room.bans.push({ team: turn.team, hero });
			room.last = { seq: ++room.seq, type: 'ban', team: turn.team, hero, player: null };
			clearSelections(room);
			if (room.bans.length >= BANS_PER_TEAM * 2) startFlip(room);
			break;
		}
		case 'pick': {
			const turn = currentTurn(room);
			if (turn?.type !== 'pick') throw new RoomError('Not in the pick phase');
			const picker = room.members.find((m) => m.id === turn.playerId);
			if (!picker) throw new RoomError('Nobody is due to pick');
			if (picker !== me) {
				// the host may pick for a disconnected player so the draft cannot get stuck
				if (room.hostId !== me.id || picker.connections > 0)
					throw new RoomError('It is not your turn to pick');
			}
			picker.hero = requireHero(room, action.hero);
			room.last = {
				seq: ++room.seq,
				type: 'pick',
				team: turn.team,
				hero: picker.hero,
				player: picker.name
			};
			clearSelections(room);
			if (!nextPicker(room)) room.phase = 'done';
			break;
		}
		case 'reset': {
			requireHost(room, me);
			finishFlip(room);
			room.phase = 'lobby';
			room.firstPick = null;
			room.pickOrder = [];
			room.last = null;
			clearSelections(room);
			room.bans = [];
			for (const m of room.members) m.hero = null;
			break;
		}
		case 'kick': {
			requireHost(room, me);
			if (room.phase !== 'lobby') throw new RoomError('Players can only be removed in the lobby');
			const target = room.members.find((m) => m.id === action.id);
			if (!target || target.id === me.id) throw new RoomError('Cannot remove that player');
			room.members = room.members.filter((m) => m !== target);
			for (const [listener, id] of [...room.listeners]) {
				if (id === target.id) {
					room.listeners.delete(listener);
					listener('kicked', null);
				}
			}
			break;
		}
		default:
			throw new RoomError('Unknown action');
	}
	broadcast(room);
}
