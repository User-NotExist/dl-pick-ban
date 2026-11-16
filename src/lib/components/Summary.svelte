<script lang="ts">
	import PatronBanner from './PatronBanner.svelte';
	import { HERO_BY_ID } from '#lib/heroes.ts';
	import { LANE_STYLE } from '#lib/lanes.ts';
	import type { RoomClient } from '#lib/room.svelte.ts';
	import {
		LANES,
		SLOTS_PER_LANE,
		TEAM_NAMES,
		type Player,
		type RoomState,
		type Team
	} from '#lib/types.ts';

	let { room, client }: { room: RoomState; client: RoomClient } = $props();

	const isHost = $derived(room.hostId === room.you);

	const lanePlayers = (team: Team, laneIndex: number) =>
		room.players
			.filter(
				(p) => p.team === team && p.slot !== null && Math.floor(p.slot / SLOTS_PER_LANE) === laneIndex
			)
			.sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0));

	const teamBorder = (t: Team) => (t === 'A' ? 'border-amber-team' : 'border-sapphire-team');
</script>

{#snippet bans(team: Team)}
	<div class="flex flex-wrap items-center gap-2 {team === 'B' ? 'flex-row-reverse' : ''}">
		<span class="hidden text-xs font-semibold tracking-wider text-paper/50 uppercase sm:inline"
			>Bans</span
		>
		{#each room.bans.filter((b) => b.team === team && b.hero) as ban (ban.hero)}
			{@const hero = HERO_BY_ID.get(ban.hero ?? '')}
			<div
				class="flex min-w-0 items-center gap-2 rounded bg-ink/60 {team === 'B'
					? 'flex-row-reverse pl-2'
					: 'pr-2'}"
			>
				<div class="relative aspect-[14/19] w-9 overflow-hidden rounded">
					<img src={hero?.banned} alt="" class="h-full w-full object-cover" />
					<span class="absolute inset-0 bg-red-600/25"></span>
				</div>
				<span class="min-w-0 truncate text-sm text-red-300 line-through">{hero?.name}</span>
			</div>
		{/each}
	</div>
{/snippet}

{#snippet entry(p: Player, team: Team)}
	{@const hero = p.hero ? HERO_BY_ID.get(p.hero) : undefined}
	<div
		class="flex animate-slide items-center gap-3 border-2 bg-ink/60 p-1.5 [animation-delay:var(--lane-delay)] {teamBorder(
			team
		)} {team === 'B' ? 'flex-row-reverse text-right' : ''}"
		style:--slide-from={team === 'B' ? '80px' : '-80px'}
	>
		<img
			src={hero?.card}
			alt=""
			class="aspect-[14/19] w-14 shrink-0 rounded object-cover sm:w-16"
		/>
		<div class="min-w-0">
			<div class="heading truncate text-2xl leading-none sm:text-3xl">{hero?.name}</div>
			<div class="truncate text-sm text-paper/70">
				{p.name}
				{#if p.id === room.you}<span class="text-paper/50">(you)</span>{/if}
			</div>
		</div>
	</div>
{/snippet}

<div class="flex animate-rise flex-col gap-4 [animation-delay:2.4s]">
	<div class="flex flex-wrap items-center gap-3">
		<h1 class="heading flex-1 text-4xl leading-none">Draft summary</h1>
		{#if isHost}
			<button
				onclick={() => client.send({ type: 'reset' })}
				class="btn btn-primary"
			>
				New draft
			</button>
		{:else}
			<span class="text-sm text-paper/50">The host can start a new draft</span>
		{/if}
	</div>

	<div class="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2">
		<PatronBanner team="A" class="aspect-[3/1] sm:aspect-[4/1]" />
		<span class="heading animate-pop text-4xl text-paper/60 [animation-delay:2.7s]">vs</span>
		<PatronBanner team="B" class="aspect-[3/1] sm:aspect-[4/1]" />
		<div>{@render bans('A')}</div>
		<span></span>
		<div>{@render bans('B')}</div>
	</div>

	{#each LANES as lane, laneIndex (lane.id)}
		{@const style = LANE_STYLE[lane.id]}
		{@const a = lanePlayers('A', laneIndex)}
		{@const b = lanePlayers('B', laneIndex)}
		<section
			class="animate-rise overflow-hidden border-l-4 bg-panel/90 {style.border}"
			style:animation-delay="{2.7 + laneIndex * 0.2}s"
			style:--lane-delay="{2.85 + laneIndex * 0.2}s"
			aria-label="{lane.name} lane"
		>
			<h2 class="flex items-center gap-2 px-3 pt-2 font-display text-xl leading-tight font-bold tracking-widest uppercase {style.text}">
				<span class="h-2.5 w-2.5 rounded-full {style.bg}"></span>
				{lane.name} lane
			</h2>
			<div class="grid grid-cols-2 gap-3 p-3">
				{#each (['A', 'B'] as const) as team (team)}
					{@const players = team === 'A' ? a : b}
					<div class="flex flex-col gap-2">
						{#each players as p (p.id)}
							{@render entry(p, team)}
						{:else}
							<div
								class="flex h-full min-h-12 items-center justify-center rounded border border-dashed border-line text-sm text-paper/40"
							>
								No {TEAM_NAMES[team]} player
							</div>
						{/each}
					</div>
				{/each}
			</div>
		</section>
	{/each}
</div>
