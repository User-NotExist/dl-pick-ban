import { error } from '@sveltejs/kit';
import { allow, record, recorded } from './ratelimit';
import { getRoom, type Room } from './rooms';

const MISS_LIMIT = 20;
const MISS_WINDOW = 60_000;

/**
 * Look a room up by code. Wrong codes are counted per client, so the 5-letter code space
 * cannot be walked to find other people's rooms.
 */
export function findRoom(code: string, client: string, missing = 'Room not found'): Room {
	if (recorded('miss', client) >= MISS_LIMIT) error(429, 'Too many attempts. Try again in a minute.');
	const room = getRoom(code);
	if (!room) {
		record('miss', client, MISS_WINDOW);
		error(404, missing);
	}
	return room;
}

/** Throws 429 once `client` exceeds `limit` requests per window for this kind of request. */
export function throttle(name: string, client: string, limit: number, windowMs: number) {
	if (!allow(name, client, limit, windowMs)) error(429, 'Too many requests. Slow down.');
}
