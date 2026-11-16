/** In-memory, per-process limits. Fine for the single instance this app runs as. */

interface Bucket {
	count: number;
	reset: number;
}

const buckets = new Map<string, Bucket>();
const open = new Map<string, number>();

const sweeper = setInterval(() => {
	const now = Date.now();
	for (const [key, b] of buckets) if (b.reset <= now) buckets.delete(key);
}, 60_000);
(sweeper as { unref?: () => void }).unref?.();

/** How many events `key` has recorded under `name` in the current window. */
export function recorded(name: string, key: string): number {
	const b = buckets.get(`${name}:${key}`);
	return b && b.reset > Date.now() ? b.count : 0;
}

/** Record one event and return the count in the current window, this one included. */
export function record(name: string, key: string, windowMs: number): number {
	const id = `${name}:${key}`;
	const now = Date.now();
	let b = buckets.get(id);
	if (!b || b.reset <= now) {
		b = { count: 0, reset: now + windowMs };
		buckets.set(id, b);
	}
	return ++b.count;
}

/** Record one event; false once `key` is over `limit` events per window. */
export function allow(name: string, key: string, limit: number, windowMs: number): boolean {
	return record(name, key, windowMs) <= limit;
}

/** Take one of `max` concurrent slots for `key`. Returns the release function, or null if none are free. */
export function acquire(key: string, max: number): (() => void) | null {
	const n = open.get(key) ?? 0;
	if (n >= max) return null;
	open.set(key, n + 1);
	let released = false;
	return () => {
		if (released) return;
		released = true;
		const left = (open.get(key) ?? 1) - 1;
		if (left > 0) open.set(key, left);
		else open.delete(key);
	};
}

/**
 * The key a client is limited by: its IPv4 address, or its IPv6 /64 (one subscriber usually
 * controls a whole /64, so single addresses would be trivial to rotate).
 */
export function clientKey(getClientAddress: () => string): string {
	let ip: string;
	try {
		ip = getClientAddress().trim().toLowerCase().slice(0, 64);
	} catch {
		// ADDRESS_HEADER is configured but the request did not come through the proxy
		return 'unknown';
	}
	const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
	if (mapped) return mapped[1];
	if (!ip.includes(':')) return ip || 'unknown';
	const [head, tail = ''] = ip.split('::');
	const h = head ? head.split(':') : [];
	const t = tail ? tail.split(':') : [];
	const groups = ip.includes('::')
		? [...h, ...Array<string>(Math.max(0, 8 - h.length - t.length)).fill('0'), ...t]
		: h;
	return `${groups
		.slice(0, 4)
		.map((x) => x.replace(/^0+(?=.)/, ''))
		.join(':')}::/64`;
}
