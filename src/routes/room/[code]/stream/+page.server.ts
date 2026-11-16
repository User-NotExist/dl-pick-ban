import { error } from '@sveltejs/kit';
import { findRoom } from '#lib/server/guard.ts';
import { clientKey } from '#lib/server/ratelimit.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params, url, getClientAddress }) => {
	const missing = 'Stream not found. The room may have expired.';
	const room = findRoom(params.code, clientKey(getClientAddress), missing);
	const key = url.searchParams.get('key') ?? '';
	// the same answer as for a missing room, so the link cannot be used to probe for rooms
	if (key !== room.streamKey) error(404, missing);
	return { code: room.code, key };
};
