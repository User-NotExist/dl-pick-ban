<script lang="ts">
	import { HERO_BY_ID } from '#lib/heroes.ts';
	import { TEAM_NAMES, type LastEvent } from '#lib/types.ts';

	let { last }: { last: LastEvent } = $props();

	const hero = $derived(HERO_BY_ID.get(last.hero));
	const ban = $derived(last.type === 'ban');
	const right = $derived(last.team === 'B');
	const teamColor = $derived(right ? 'var(--color-sapphire-team)' : 'var(--color-amber-team)');
	const accent = $derived(ban ? '#dc2626' : teamColor);
</script>

<!-- Broadcast-style band: sweeps in from the acting team's side, holds, exits the other side. -->
<div
	class="pointer-events-none fixed inset-0 z-40 overflow-hidden"
	aria-hidden="true"
	style:--accent={accent}
	style:--from={right ? '112%' : '-112%'}
	style:--slide-from={right ? '120px' : '-120px'}
>
	<div class="absolute inset-0 animate-dim bg-black/65"></div>

	<div class="absolute top-1/2 left-[-8%] h-40 w-[116%] -translate-y-1/2 animate-band sm:h-64">
		<div
			class="absolute inset-0 -skew-x-12 border-y-4 bg-ink"
			style:border-color={accent}
			style:background-image="linear-gradient({right
				? 'to left'
				: 'to right'}, color-mix(in srgb, var(--accent) 60%, transparent), transparent 65%)"
		></div>
		<div class="absolute inset-0 -skew-x-12 animate-flash bg-white"></div>

		<div
			class="relative mx-auto flex h-full max-w-5xl items-center gap-4 px-[11%] sm:gap-8 {right
				? 'flex-row-reverse text-right'
				: ''}"
		>
			<div
				class="relative aspect-[14/19] h-[118%] shrink-0 animate-slide overflow-hidden border-x-4 shadow-2xl [animation-delay:0.18s]"
				style:border-color={accent}
			>
				<img src={ban ? hero?.banned : hero?.card} alt="" class="h-full w-full object-cover" />
				{#if ban}
					<span class="absolute inset-0 bg-red-600/25"></span>
					<span
						class="absolute top-1/2 left-[-20%] h-1.5 w-[140%] -rotate-[52deg] animate-slash bg-red-500 [animation-delay:0.5s]"
					></span>
				{/if}
			</div>

			<div class="min-w-0 animate-slide [animation-delay:0.28s]">
				<div
					class="truncate text-xs font-display font-bold tracking-[0.3em] uppercase sm:text-lg"
					style:color={teamColor}
				>
					{ban ? TEAM_NAMES[last.team] : `${last.player} · ${TEAM_NAMES[last.team]}`}
				</div>
				<div class="text-5xl leading-none font-display font-extrabold uppercase italic sm:text-8xl">
					{hero?.name}
				</div>
				<div
					class="mt-2 inline-block -skew-x-12 px-3 py-0.5 text-sm font-display font-extrabold italic tracking-[0.2em] uppercase sm:mt-3 sm:text-xl {ban
						? 'text-white'
						: 'text-ink'}"
					style:background-color={accent}
				>
					{ban ? 'Banned' : 'Selected'}
				</div>
			</div>
		</div>
	</div>
</div>
