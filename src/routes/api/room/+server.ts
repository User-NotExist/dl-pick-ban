import { json } from '@sveltejs/kit';
import { createRoom } from '#lib/server/rooms.ts';

export function POST() {
	return json({ code: createRoom().code });
}
