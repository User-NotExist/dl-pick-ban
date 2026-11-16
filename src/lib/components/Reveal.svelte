<script lang="ts">
	import { HERO_BY_ID } from '#lib/heroes.ts';
	import { TEAM_NAMES, type LastEvent } from '#lib/types.ts';

	let { last }: { last: LastEvent } = $props();

	const hero = $derived(last.hero ? HERO_BY_ID.get(last.hero) : undefined);
	/** the team ran out of time with nothing selected */
	const noBan = $derived(last.hero === null);
	const ban = $derived(last.type === 'ban');
	const right = $derived(last.team === 'B');
	const teamColor = $derived(right ? 'var(--color-sapphire-team)' : 'var(--color-amber-team)');
	const accent = $derived(ban ? '#dc2626' : teamColor);
</script>

<!-- Headline band: sweeps in from the acting team's side, holds, exits the other side. -->
<div
	class="pointer-events-none fixed inset-0 z-40 overflow-hidden"
	aria-hidden="true"
	style:--accent={accent}
	style:--from={right ? '112%' : '-112%'}
	style:--slide-from={right ? '120px' : '-120px'}
>
	<div class="absolute inset-0 animate-dim bg-black/65"></div>

	<div class="absolute top-1/2 left-0 h-40 w-full -translate-y-1/2 animate-band sm:h-64">
		<div
			class="absolute inset-0 border-y-2 bg-ink"
			style:border-color={accent}
			style:background-image="linear-gradient({right
				? 'to left'
				: 'to right'}, color-mix(in srgb, var(--accent) 40%, transparent), transparent 65%)"
		>
			<div class="absolute inset-x-0 inset-y-1.5 border-y opacity-50" style:border-color={accent}></div>
		</div>
		<div class="absolute inset-0 animate-flash bg-paper"></div>

		<div
			class="relative mx-auto flex h-full max-w-5xl items-center gap-4 px-6 sm:gap-8 {right
				? 'flex-row-reverse text-right'
				: ''}"
		>
			<div
				class="relative aspect-[14/19] deco h-[118%] shrink-0 animate-slide overflow-hidden border-2 bg-panel shadow-2xl [animation-delay:0.18s]"
				style:border-color={accent}
				style:--deco-color={accent}
			>
				{#if noBan}
					<div
						class="heading flex h-full w-full items-center justify-center bg-panel text-7xl text-paper/30 sm:text-9xl"
					>
						—
					</div>
				{:else}
					<img
						src={ban ? hero?.banned : hero?.card}
						alt=""
						class="h-full w-full object-cover {ban ? 'grayscale' : ''}"
					/>
				{/if}
				{#if ban && !noBan}
					<span class="absolute inset-0 bg-red-950/30"></span>
					<span class="seal animate-stamp [animation-delay:0.5s]"></span>
				{/if}
			</div>

			<div class="min-w-0 animate-slide [animation-delay:0.28s]">
				<div
					class="truncate text-xs font-display font-bold tracking-[0.3em] uppercase sm:text-lg"
					style:color={teamColor}
				>
					{ban ? TEAM_NAMES[last.team] : `${last.player} · ${TEAM_NAMES[last.team]}`}
				</div>
				<div class="heading text-4xl leading-tight sm:text-7xl">
					{noBan ? 'No ban' : hero?.name}
				</div>
				<div
					class="tag mt-2 px-3 py-0.5 text-sm tracking-[0.2em] sm:mt-3 sm:text-xl {ban
						? 'text-paper!'
						: ''}"
					style:background-color={accent}
				>
					{noBan ? 'Time ran out' : ban ? 'Banned' : 'Selected'}
				</div>
			</div>
		</div>
	</div>
</div>
