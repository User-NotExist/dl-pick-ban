<script lang="ts">
	import { untrack } from 'svelte';
	import { fade } from 'svelte/transition';
	import { HERO_BY_ID } from '#lib/heroes.ts';
	import { Roll, rollCandidates } from '#lib/roll.svelte.ts';
	import { TEAM_NAMES, type LastEvent, type RoomState } from '#lib/types.ts';

	/** mounted once per random pick (keyed on its `seq`) */
	let { room, last }: { room: RoomState; last: LastEvent } = $props();

	const roll = new Roll();
	$effect(() => {
		untrack(() => roll.start(last, rollCandidates(room, last)));
		return () => roll.stop();
	});

	const teamColor = $derived(
		last.team === 'B' ? 'var(--color-sapphire-team)' : 'var(--color-amber-team)'
	);
</script>

<!--
	Roulette for a random pick on the stream overlay, which has no hero pool of its own: the free
	heroes are laid out as a pool and the highlight hops between them until it lands on the rolled
	one. The reveal band then plays over it.
-->
{#if roll.active}
	<div
		class="pointer-events-none fixed inset-0 z-30 flex flex-col items-center justify-center gap-8 bg-ink/90"
		transition:fade={{ duration: 200 }}
		role="status"
		style:--glow-color={teamColor}
	>
		<div class="flex flex-col items-center gap-1 text-center">
			<div
				class="font-display text-2xl font-semibold tracking-[0.4em] uppercase"
				style:color={teamColor}
			>
				{last.player} · {TEAM_NAMES[last.team]}
			</div>
			<div class="heading text-6xl leading-tight">Random pick</div>
		</div>
		<div class="grid max-w-[1400px] grid-cols-[repeat(auto-fit,96px)] justify-center gap-3 px-8">
			{#each roll.candidates as id (id)}
				{@const hero = HERO_BY_ID.get(id)}
				{@const hop = roll.current === id}
				{#if hero}
					<div
						class="relative aspect-[14/19] w-24 overflow-hidden border-2 bg-panel transition duration-75 {hop
							? 'z-[1] scale-115'
							: 'border-brass/30 opacity-50'}"
						style:border-color={hop ? teamColor : null}
						style:box-shadow={hop
							? `0 0 0 2px ${teamColor}, 0 0 28px 4px color-mix(in srgb, ${teamColor} 60%, transparent)`
							: null}
					>
						<img src={hero.card} alt="" class="h-full w-full object-cover" />
						{#if hop && roll.landed}
							<span class="absolute inset-y-0 left-0 w-1/2 animate-shine bg-paper/50"></span>
						{/if}
					</div>
				{/if}
			{/each}
		</div>
	</div>
{/if}
