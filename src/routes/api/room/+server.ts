import { error, json } from '@sveltejs/kit';
import { throttle } from '#lib/server/guard.ts';
import { clientKey } from '#lib/server/ratelimit.ts';
import { createRoom, RoomError } from '#lib/server/rooms.ts';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = ({ getClientAddress }) => {
	throttle('create', clientKey(getClientAddress), 5, 60_000);
	try {
		return json({ code: createRoom().code });
	} catch (e) {
		if (e instanceof RoomError) error(503, e.message);
		throw e;
	}
};
