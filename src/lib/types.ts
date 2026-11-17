export type Team = 'A' | 'B';
/**
 * `flip` is the short coin-flip pause that decides which team goes first: between the last ban
 * and the first pick in Casual, before anything else in Night Shift.
 */
export type Phase = 'lobby' | 'ban' | 'flip' | 'pick' | 'done';

/**
 * Draft format, chosen by the host in the lobby.
 * - `casual`: bans A-B-A-B, then a coin flip for first pick, then picks 1-2-2-...-1.
 * - `nightshift`: coin flip first; with A the winner: ban A-B-A-B, pick A-B-B-A-B-A,
 *   ban B-A, pick B-A-A-B-A-B.
 */
export type Format = 'casual' | 'nightshift';

export interface Player {
	id: string;
	name: string;
	team: Team | null;
	/** seat within the team, 0-5: two seats per lane, in lane order. Also the pick order. */
	slot: number | null;
	hero: string | null;
	online: boolean;
	/** created and controlled by the host, standing in for someone who is not in the room */
	fake: boolean;
}

export interface Ban {
	team: Team;
	/** null when the team ran out of time without selecting a hero: the ban is forfeited */
	hero: string | null;
}

export type Turn =
	| { type: 'ban'; team: Team }
	/** exactly one player picks per turn */
	| { type: 'pick'; team: Team; playerId: string };

/** The most recent ban or pick, used to play the reveal animation. */
export interface LastEvent {
	seq: number;
	type: 'ban' | 'pick';
	team: Team;
	/** null for a ban forfeited because the team ran out of time */
	hero: string | null;
	/** name of the player who received the hero (picks only) */
	player: string | null;
	/** the server rolled the hero: the Random card was locked in, or a pick timed out with nothing selected */
	random: boolean;
}

/** A hero a player has selected but not confirmed; `RANDOM_HERO` during picks for "surprise me". */
export interface Selection {
	playerId: string;
	hero: string;
}

export interface RoomState {
	code: string;
	phase: Phase;
	hostId: string;
	format: Format;
	players: Player[];
	bans: Ban[];
	/** ban slots each team has in this draft; depends on the format (and, in Night Shift, team sizes) */
	bansPerTeam: number;
	turn: Turn | null;
	last: LastEvent | null;
	/** team that won the coin flip and goes first; null until the flip */
	firstPick: Team | null;
	/** player ids in pick order; empty until the coin flip has finished */
	pickOrder: string[];
	/**
	 * Unconfirmed selections for the current turn, oldest first. Only sent to the acting team
	 * and to spectators; the opposing team receives an empty list.
	 */
	selections: Selection[];
	/** time limit per ban/pick turn in seconds, chosen by the host; 0 means no limit */
	turnSeconds: number;
	/**
	 * Milliseconds left in the current turn when this snapshot was made, or null when no clock
	 * is running. Sent as a duration so clients do not depend on their clock matching the server's.
	 */
	turnEndsIn: number | null;
	/** secret for the stream page's link; sent to the host only, null for everyone else */
	streamKey: string | null;
	/** id of the player receiving this snapshot */
	you: string;
}

export type Action =
	/** take a seat on a team (first free seat if `slot` is omitted), or leave with `team: null` */
	| { type: 'setTeam'; team: Team | null; slot?: number }
	/** host only: seat another player (swapping with any occupant), or `team: null` to make them a spectator */
	| { type: 'move'; id: string; team: Team | null; slot?: number }
	| { type: 'shuffle' }
	| { type: 'start' }
	/** mark (or clear) the hero you are considering before confirming; `RANDOM_HERO` is allowed during picks */
	| { type: 'select'; hero: string | null }
	| { type: 'ban'; hero: string }
	/** `hero: RANDOM_HERO` locks in a random available hero, rolled by the server */
	| { type: 'pick'; hero: string }
	/** host only, in the lobby: set the time limit per turn (one of TURN_TIME_OPTIONS) */
	| { type: 'setTimer'; seconds: number }
	/** host only, in the lobby: choose the draft format */
	| { type: 'setFormat'; format: Format }
	| { type: 'reset' }
	| { type: 'kick'; id: string }
	/** host only, in the lobby: add a fake player (as a spectator) that the host acts for */
	| { type: 'addFake'; name: string };

export const TEAM_SIZE = 6;
export const FORMATS: readonly { id: Format; name: string }[] = [
	{ id: 'casual', name: 'Casual' },
	{ id: 'nightshift', name: 'Night Shift' }
];
export const DEFAULT_FORMAT: Format = 'casual';
/** stands in for a hero id in a pick or a pick selection: the server rolls the hero on lock-in */
export const RANDOM_HERO = 'random';
/** selectable time limits per turn, in seconds; 0 turns the clock off */
export const TURN_TIME_OPTIONS = [0, 20, 30, 45, 60, 90] as const;
export const DEFAULT_TURN_SECONDS = 30;
/** added to every turn so the reveal animation of the previous one does not eat into it */
export const TURN_GRACE_S = 2;
/** a random pick plays a roulette over the hero pool first: added to the next turn's grace */
export const RANDOM_ROLL_S = 1.5;
/**
 * Client timeline of the `flip` phase: wait for the last ban's reveal band (only when a ban
 * came before the flip), then the coin.
 */
export const FLIP_REVEAL_DELAY_S = 2;
export const FLIP_COIN_S = 4.5;

export const LANES = [
	{ id: 'yellow', name: 'Yellow' },
	{ id: 'blue', name: 'Blue' },
	{ id: 'green', name: 'Green' }
] as const;
export const SLOTS_PER_LANE = TEAM_SIZE / LANES.length;
export const laneOfSlot = (slot: number) => LANES[Math.floor(slot / SLOTS_PER_LANE)];
export const TEAM_NAMES: Record<Team, string> = { A: 'The Hidden King', B: 'The Archmother' };
