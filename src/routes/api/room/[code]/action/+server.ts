import { error, json } from '@sveltejs/kit';
import { act, getRoom, RoomError } from '#lib/server/rooms.ts';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, request }) => {
	const room = getRoom(params.code);
	if (!room) error(404, 'Room not found');
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
