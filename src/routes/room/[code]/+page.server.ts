import { findRoom } from '#lib/server/guard.ts';
import { clientKey } from '#lib/server/ratelimit.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params, getClientAddress }) => {
	const room = findRoom(
		params.code,
		clientKey(getClientAddress),
		'Room not found. It may have expired.'
	);
	return { code: room.code };
};
