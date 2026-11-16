import type { Action, RoomState } from './types';

export class RoomClient {
	state = $state<RoomState | null>(null);
	connected = $state(false);
	kicked = $state(false);
	/** why the server refused the connection (room full, kick cooldown, rate limit); empty if it did not */
	rejected = $state('');
	error = $state('');

	#source: EventSource;
	#code: string;
	#token: string;
	#errorTimer: ReturnType<typeof setTimeout> | undefined;

	constructor(code: string, token: string, name: string) {
		this.#code = code;
		this.#token = token;
		const params = new URLSearchParams({ token, name });
		this.#source = new EventSource(`/api/room/${code}/events?${params}`);
		this.#source.addEventListener('open', () => (this.connected = true));
		this.#source.addEventListener('error', () => {
			this.connected = false;
			// CLOSED means the browser has given up (the room is gone, or we are rate limited)
			if (this.#source.readyState === EventSource.CLOSED && !this.kicked && !this.rejected)
				this.rejected = 'Could not connect to the room. It may have expired.';
		});
		this.#source.addEventListener('rejected', (e) => {
			this.rejected = JSON.parse((e as MessageEvent).data).message;
			this.close();
		});
		this.#source.addEventListener('state', (e) => {
			this.connected = true;
			this.state = JSON.parse((e as MessageEvent).data);
		});
		this.#source.addEventListener('kicked', () => {
			this.kicked = true;
			this.close();
		});
	}

	async send(action: Action) {
		try {
			const res = await fetch(`/api/room/${this.#code}/action`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ token: this.#token, ...action })
			});
			if (!res.ok) {
				const body = await res.json().catch(() => null);
				this.#flash(body?.message ?? 'Something went wrong');
			}
		} catch {
			this.#flash('Could not reach the server');
		}
	}

	#flash(message: string) {
		this.error = message;
		clearTimeout(this.#errorTimer);
		this.#errorTimer = setTimeout(() => (this.error = ''), 4000);
	}

	close() {
		this.#source.close();
		this.connected = false;
	}
}
