import { error, json } from '@sveltejs/kit';
import { findRoom, throttle } from '#lib/server/guard.ts';
import { clientKey } from '#lib/server/ratelimit.ts';
import { act, RoomError } from '#lib/server/rooms.ts';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, request, getClientAddress }) => {
	const client = clientKey(getClientAddress);
	// every action is re-broadcast to the whole room; generous enough for a full lobby on one IP
	throttle('action', client, 300, 10_000);
	const room = findRoom(params.code, client);
	const body = await request.json().catch(() => null);
	if (!body || typeof body !== 'object') error(400, 'Invalid request');
	const { token, ...action } = body;
	try {
		act(room, token, action);
	} catch (e) {
		if (e instanceof RoomError) error(400, e.message);
		throw e;
	}
	return json({ ok: true });
};
