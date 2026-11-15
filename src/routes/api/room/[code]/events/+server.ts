import { error } from '@sveltejs/kit';
import { cleanName, getRoom, join, RoomError, subscribe } from '#lib/server/rooms.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ params, url, request }) => {
	const room = getRoom(params.code);
	if (!room) error(404, 'Room not found');

	let member;
	try {
		member = join(room, url.searchParams.get('token') ?? '', cleanName(url.searchParams.get('name')));
	} catch (e) {
		if (e instanceof RoomError) error(400, e.message);
		throw e;
	}

	const encoder = new TextEncoder();
	let cleanup = () => {};

	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			const send = (text: string) => {
				try {
					controller.enqueue(encoder.encode(text));
				} catch {
					cleanup();
				}
			};
			const unsubscribe = subscribe(room, member, (event, state) => {
				send(`event: ${event}\ndata: ${JSON.stringify(state)}\n\n`);
				if (event === 'kicked') cleanup();
			});
			const heartbeat = setInterval(() => send(': ping\n\n'), 5_000);
			cleanup = () => {
				clearInterval(heartbeat);
				unsubscribe();
				try {
					controller.close();
				} catch {
					// already closed
				}
			};
			request.signal.addEventListener('abort', () => cleanup());
		},
		cancel() {
			cleanup();
		}
	});

	return new Response(stream, {
		headers: {
			'content-type': 'text/event-stream',
			'cache-control': 'no-cache, no-transform',
			'x-accel-buffering': 'no'
		}
	});
};
