import { findRoom } from '#lib/server/guard.ts';
import { acquire, allow, clientKey } from '#lib/server/ratelimit.ts';
import { cleanName, isMember, join, RoomError, subscribe } from '#lib/server/rooms.ts';
import type { RequestHandler } from './$types';

/** open event streams per client, across all rooms */
const MAX_STREAMS = 60;

const HEADERS = {
	'content-type': 'text/event-stream',
	'cache-control': 'no-cache, no-transform',
	'x-accel-buffering': 'no'
};

/**
 * EventSource hides the status and body of a failed request, so a refusal is delivered as a
 * one-off event on an otherwise normal stream. The client closes the stream when it sees it.
 */
const rejected = (message: string) =>
	new Response(`event: rejected\ndata: ${JSON.stringify({ message })}\n\n`, { headers: HEADERS });

export const GET: RequestHandler = ({ params, url, request, getClientAddress }) => {
	const client = clientKey(getClientAddress);
	const room = findRoom(params.code, client);

	// each new stream triggers a broadcast to the room, so reconnect loops are limited too
	if (!allow('connect', client, 120, 60_000))
		return rejected('Too many connections. Try again in a minute.');

	const token = url.searchParams.get('token') ?? '';
	if (!isMember(room, token) && !allow('join', client, 30, 60_000))
		return rejected('Too many joins from your network. Try again in a minute.');

	const release = acquire(client, MAX_STREAMS);
	if (!release) return rejected('Too many open connections from your network.');

	let member;
	try {
		member = join(room, token, cleanName(url.searchParams.get('name')));
	} catch (e) {
		release();
		if (e instanceof RoomError) return rejected(e.message);
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
				release();
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

	return new Response(stream, { headers: HEADERS });
};
