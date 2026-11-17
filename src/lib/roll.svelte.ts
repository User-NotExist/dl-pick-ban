import { HERO_IDS } from './hero-ids';
import { RANDOM_ROLL_S, type LastEvent, type RoomState } from './types';

const HOPS = 14;

/** small seeded PRNG, so every client plays the same hops for the same pick */
function mulberry32(seed: number) {
	return () => {
		seed = (seed + 0x6d2b79f5) | 0;
		let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** Heroes the roll could have landed on: free before the pick, including the rolled one. */
export function rollCandidates(room: RoomState, last: LastEvent): string[] {
	const taken = new Set([
		...room.bans.map((b) => b.hero),
		...room.players.filter((p) => p.hero && p.hero !== last.hero).map((p) => p.hero)
	]);
	return HERO_IDS.filter((h) => !taken.has(h));
}

/** The heroes the highlight visits, ending on `target`, never on the same hero twice in a row. */
export function hopSequence(candidates: string[], target: string, seed: number): string[] {
	const rand = mulberry32(seed);
	const out: string[] = [];
	if (candidates.length > 1) {
		for (let i = 0; i < HOPS - 1; i++) {
			const prev = out.at(-1);
			// the hop before the landing must not already be the target either
			const pool = candidates.filter((h) => h !== prev && (i < HOPS - 2 || h !== target));
			out.push(pool[Math.floor(rand() * pool.length)]);
		}
	}
	out.push(target);
	return out;
}

/**
 * Timeline of the roulette that plays before the reveal of a random pick: a highlight hops
 * over the candidate heroes, slowing down, and lands on the rolled hero after `RANDOM_ROLL_S`.
 */
export class Roll {
	/** the hero under the highlight; null when no roll is playing */
	current = $state<string | null>(null);
	/** the roll is playing or has landed; false once it is over */
	active = $state(false);
	landed = $state(false);
	candidates = $state<string[]>([]);

	#timers: ReturnType<typeof setTimeout>[] = [];

	start(last: LastEvent, candidates: string[]) {
		this.stop();
		if (!last.hero) return;
		this.candidates = candidates;
		this.active = true;
		const hops = hopSequence(candidates, last.hero, last.seq);
		const reduced =
			typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
		if (reduced) {
			this.current = last.hero;
			this.landed = true;
		} else {
			// intervals grow quadratically: quick at first, then settling onto the hero; the last
			// part of the roll holds the landed hero before the reveal band takes over
			const spin = RANDOM_ROLL_S * 1000 * 0.8;
			const weights = hops.map((_, i) => 1 + (i / hops.length) ** 2 * 5);
			const unit = spin / weights.reduce((a, b) => a + b, 0);
			let t = 0;
			hops.forEach((hero, i) => {
				this.#timers.push(
					setTimeout(() => {
						this.current = hero;
						if (i === hops.length - 1) this.landed = true;
					}, t)
				);
				t += weights[i] * unit;
			});
		}
		this.#timers.push(setTimeout(() => this.stop(), RANDOM_ROLL_S * 1000 + 400));
	}

	stop() {
		for (const t of this.#timers) clearTimeout(t);
		this.#timers = [];
		this.current = null;
		this.active = false;
		this.landed = false;
		this.candidates = [];
	}
}
