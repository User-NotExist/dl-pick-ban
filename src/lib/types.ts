export type Team = 'A' | 'B';
/** `flip` is the short coin-flip pause between the last ban and the first pick */
export type Phase = 'lobby' | 'ban' | 'flip' | 'pick' | 'done';

export interface Player {
	id: string;
	name: string;
	team: Team | null;
	/** seat within the team, 0-5: two seats per lane, in lane order. Also the pick order. */
	slot: number | null;
	hero: string | null;
	online: boolean;
}

export interface Ban {
	team: Team;
	hero: string;
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
	hero: string;
	/** name of the player who received the hero (picks only) */
	player: string | null;
}

/** A hero a player has selected but not confirmed. */
export interface Selection {
	playerId: string;
	hero: string;
}

export interface RoomState {
	code: string;
	phase: Phase;
	hostId: string;
	players: Player[];
	bans: Ban[];
	turn: Turn | null;
	last: LastEvent | null;
	/** team that won the coin flip for first pick; null until the flip, after the bans */
	firstPick: Team | null;
	/** player ids in pick order; empty until the coin flip has finished */
	pickOrder: string[];
	/**
	 * Unconfirmed selections for the current turn, oldest first. Only sent to the acting team
	 * and to spectators; the opposing team receives an empty list.
	 */
	selections: Selection[];
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
	/** mark (or clear) the hero you are considering before confirming */
	| { type: 'select'; hero: string | null }
	| { type: 'ban'; hero: string }
	| { type: 'pick'; hero: string }
	| { type: 'reset' }
	| { type: 'kick'; id: string };

export const TEAM_SIZE = 6;
export const BANS_PER_TEAM = 2;
/** Client timeline of the `flip` phase: wait for the last ban's reveal band, then the coin. */
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
