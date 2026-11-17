<script lang="ts">
	import { onDestroy } from 'svelte';
	import CoinFlip from './CoinFlip.svelte';
	import PatronBanner from './PatronBanner.svelte';
	import Reveal from './Reveal.svelte';
	import Stinger from './Stinger.svelte';
	import { HERO_BY_ID } from '#lib/heroes.ts';
	import { LANE_STYLE } from '#lib/lanes.ts';
	import { RoomClient } from '#lib/room.svelte.ts';
	import {
		FLIP_REVEAL_DELAY_S,
		LANES,
		SLOTS_PER_LANE,
		TEAM_NAMES,
		TEAM_SIZE,
		type Player,
		type Team
	} from '#lib/types.ts';

	let { code, streamKey }: { code: string; streamKey: string } = $props();

	/** the stage is laid out at this size and scaled as a whole to fit the window */
	const STAGE_W = 1920;
	const STAGE_H = 1080;
	let innerWidth = $state(STAGE_W);
	let innerHeight = $state(STAGE_H);
	const scale = $derived(Math.min(innerWidth / STAGE_W, innerHeight / STAGE_H));

	// one connection for the lifetime of this component; it watches without joining the room
	// svelte-ignore state_referenced_locally
	const client = new RoomClient(code, '', '', streamKey);
	onDestroy(() => client.close());

	const room = $derived(client.state);
	const turn = $derived(room?.turn ?? null);
	const players = $derived(room?.players ?? []);
	const seated = $derived(players.filter((p) => p.team));

	const picker = $derived(
		turn?.type === 'pick' ? players.find((p) => p.id === turn.playerId) : undefined
	);
	/** whose selection is "the" pending pick: the picker, or the host acting for an offline one */
	const leadId = $derived(picker && !picker.online ? room?.hostId : picker?.id);

	const marks = $derived(
		(room?.selections ?? []).flatMap((s) => {
			const player = players.find((p) => p.id === s.playerId);
			const hero = HERO_BY_ID.get(s.hero);
			if (!player || !hero) return [];
			return [{ player, hero, lead: turn?.type === 'ban' || player.id === leadId }];
		})
	);
	/** hero shown as a ghost in the picker's seat / the next ban slot */
	const ghost = $derived(
		turn?.type === 'pick'
			? marks.find((m) => m.lead)?.hero
			: marks.filter((m) => m.lead).at(-1)?.hero
	);

	const considering = $derived.by(() => {
		if (!turn || !marks.length) return '';
		const list = (ms: typeof marks) =>
			ms.map((m) => `${m.hero.name} (${m.player.name})`).join(', ');
		if (turn.type === 'ban') return `Considering: ${list(marks)}`;
		const lead = marks.find((m) => m.lead);
		const suggestions = marks.filter((m) => !m.lead);
		return [
			lead && `${picker?.name} is considering ${lead.hero.name}`,
			suggestions.length && `Suggested: ${list(suggestions)}`
		]
			.filter(Boolean)
			.join(' · ');
	});

	// Turn clock, as on the draft page: the grace the server adds is hidden, so the display
	// holds at the full limit while the previous reveal plays, then counts down.
	let now = $state(Date.now());
	$effect(() => {
		if (client.deadline === null) return;
		now = Date.now();
		const tick = setInterval(() => (now = Date.now()), 200);
		return () => clearInterval(tick);
	});
	const msLeft = $derived(
		client.deadline === null || !turn || !room
			? null
			: Math.max(0, Math.min(client.deadline - now, room.turnSeconds * 1000))
	);
	const secondsLeft = $derived(msLeft === null ? null : Math.ceil(msLeft / 1000));
	const urgent = $derived(secondsLeft !== null && secondsLeft <= 5);

	const phaseLabel = $derived.by(() => {
		if (!room) return '';
		if (room.phase === 'lobby') return `Lobby · ${seated.length} / ${TEAM_SIZE * 2} players`;
		if (room.phase === 'flip') return room.format === 'casual' ? 'First pick' : 'Who goes first';
		if (turn?.type === 'ban') return `Ban phase · ${room.bans.length + 1} / ${room.bansPerTeam * 2}`;
		if (turn?.type === 'pick')
			return `Pick phase · ${seated.filter((p) => p.hero).length + 1} / ${seated.length}`;
		return 'Final draft';
	});

	const status = $derived.by(() => {
		if (!room) return '';
		if (room.phase === 'lobby') return 'Waiting to start';
		if (room.phase === 'flip') return 'Coin flip';
		if (!turn) return 'Draft complete';
		if (turn.type === 'ban') return `${TEAM_NAMES[turn.team]} ban`;
		return `${picker?.name ?? TEAM_NAMES[turn.team]} picks`;
	});

	const seatOf = (team: Team, slot: number) =>
		players.find((p) => p.team === team && p.slot === slot);

	const teamText = (t: Team) => (t === 'A' ? 'text-amber-team' : 'text-sapphire-team');
	const teamBorder = (t: Team) => (t === 'A' ? 'border-amber-team' : 'border-sapphire-team');
	const teamBg = (t: Team) => (t === 'A' ? 'bg-amber-team' : 'bg-sapphire-team');
	const teamColor = (t: Team) =>
		t === 'A' ? 'var(--color-amber-team)' : 'var(--color-sapphire-team)';
</script>

<svelte:window bind:innerWidth bind:innerHeight />

{#snippet seat(p: Player | undefined, team: Team)}
	{@const hero = p?.hero ? HERO_BY_ID.get(p.hero) : undefined}
	{@const picking = !!p && picker?.id === p.id}
	{@const pending = picking ? ghost : undefined}
	{@const order = p && room ? room.pickOrder.indexOf(p.id) + 1 : 0}
	<div
		class="deco relative min-h-0 overflow-hidden border border-b-4 bg-panel/90 {teamBorder(team)} {picking
			? 'animate-glow'
			: ''} {p ? '' : 'opacity-40'}"
		style:--deco-color={teamColor(team)}
		style:--glow-color={teamColor(team)}
	>
		{#if hero}
			<img
				src={hero.card}
				alt=""
				class="absolute inset-0 h-full w-full animate-pop object-cover object-top"
			/>
		{:else if pending}
			<img
				src={pending.card}
				alt=""
				class="absolute inset-0 h-full w-full animate-pulse object-cover object-top opacity-50"
			/>
		{:else}
			<div
				class="heading absolute inset-0 flex items-center justify-center pb-16 text-[120px] leading-none text-paper/10"
			>
				{p ? '?' : ''}
			</div>
		{/if}

		{#if order}
			<span
				class="heading absolute top-2 px-3 text-4xl leading-none [text-shadow:0_2px_6px_rgb(0_0_0/0.9)] {team ===
				'B'
					? 'left-1'
					: 'right-1'} {picking ? 'text-paper' : 'text-paper/60'}">{order}</span
			>
		{/if}
		{#if picking && !hero}
			<span
				class="tag absolute top-3 px-4 text-xl leading-tight {teamBg(team)} {team === 'B'
					? 'right-3'
					: 'left-3'}">Picking</span
			>
		{/if}

		<div
			class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink via-ink/85 to-transparent px-4 pt-12 pb-2.5 {team ===
			'B'
				? 'text-right'
				: ''}"
		>
			{#if p}
				<div
					class="truncate font-display text-[34px] leading-none font-bold tracking-wide uppercase {p.online ||
					p.fake
						? ''
						: 'text-paper/50'}"
				>
					{p.name}
				</div>
				<div class="heading truncate text-xl leading-snug {teamText(team)}">
					{#if hero}
						{hero.name}
					{:else if pending}
						<span class="opacity-70">{pending.name}?</span>
					{:else if !p.online && !p.fake}
						<span class="text-paper/40">Offline</span>
					{:else}
						&nbsp;
					{/if}
				</div>
			{:else}
				<div class="font-display text-2xl leading-none font-bold tracking-wide text-paper/50 uppercase">
					Empty seat
				</div>
			{/if}
		</div>
	</div>
{/snippet}

<!-- Three lane columns of two seats each. Team B is mirrored so both rosters face the centre. -->
{#snippet roster(team: Team)}
	<section
		class="grid min-h-0 grid-flow-col grid-cols-3 grid-rows-[auto_minmax(0,1fr)_minmax(0,1fr)] gap-x-4 gap-y-3"
		aria-label="{TEAM_NAMES[team]} players"
	>
		{#each team === 'A' ? LANES.map((_, i) => i) : LANES.map((_, i) => i).reverse() as laneIndex (laneIndex)}
			{@const lane = LANES[laneIndex]}
			{@const style = LANE_STYLE[lane.id]}
			<h3
				class="flex items-center gap-2 border-b-2 pb-1 font-display text-2xl leading-none font-bold tracking-[0.25em] uppercase {style.text} {style.border} {team ===
				'B'
					? 'flex-row-reverse'
					: ''}"
			>
				<span class="size-3 rotate-45 {style.bg}"></span>
				{lane.name}
			</h3>
			{#each { length: SLOTS_PER_LANE }, i}
				{@render seat(seatOf(team, laneIndex * SLOTS_PER_LANE + i), team)}
			{/each}
		{/each}
	</section>
{/snippet}

{#snippet banner(team: Team)}
	<div
		class="overflow-hidden border-t-2 transition {teamBorder(team)} {turn?.team === team
			? 'animate-glow'
			: turn
				? 'opacity-70'
				: ''}"
		style:--glow-color={teamColor(team)}
	>
		<PatronBanner {team} class="h-full" />
	</div>
{/snippet}

{#snippet bans(team: Team)}
	{@const list = room?.bans.filter((b) => b.team === team) ?? []}
	<div class="flex min-w-0 items-center gap-5 {team === 'B' ? 'flex-row-reverse' : ''}">
		<span class="font-display text-3xl font-bold tracking-[0.25em] text-paper/50 uppercase">Bans</span>
		<div class="flex shrink-0 gap-3">
			{#each { length: room?.bansPerTeam ?? 0 }, i}
				{@const hero = HERO_BY_ID.get(list[i]?.hero ?? '')}
				{@const skipped = !!list[i] && !list[i].hero}
				{@const pending =
					turn?.type === 'ban' && turn.team === team && i === list.length ? ghost : undefined}
				<div
					class="deco relative flex h-[124px] w-[91px] items-center justify-center overflow-hidden border bg-ink/60 {hero
						? 'border-red-700'
						: 'border-brass/40'}"
					style:--deco-color={hero ? '#dc2626' : null}
				>
					{#if hero}
						<img src={hero.banned} alt="" class="h-full w-full animate-wash object-cover grayscale" />
						<span class="absolute inset-0 animate-wash bg-red-950/30"></span>
						<span class="seal animate-stamp"></span>
					{:else if pending}
						<img src={pending.card} alt="" class="h-full w-full animate-pulse object-cover opacity-60" />
					{:else if skipped}
						<span class="text-4xl leading-none text-paper/40">—</span>
					{/if}
				</div>
			{/each}
		</div>
		<div class="flex min-w-0 flex-col gap-1.5 {team === 'B' ? 'items-end text-right' : ''}">
			{#each list as ban, i (i)}
				<span class="truncate font-display text-2xl leading-none font-bold tracking-wide uppercase {ban.hero ? 'text-red-300' : 'text-paper/40'}">
					{HERO_BY_ID.get(ban.hero ?? '')?.name ?? 'No ban'}
				</span>
			{/each}
			{#if turn?.type === 'ban' && turn.team === team}
				<span class="tag w-fit px-3 text-xl leading-tight {teamBg(team)}">Banning</span>
			{/if}
			{#if room?.firstPick === team && room.phase !== 'flip'}
				<span class="tag w-fit px-3 text-xl leading-tight {teamBg(team)}"
					>{room.format === 'casual' ? 'First pick' : 'Goes first'}</span
				>
			{/if}
		</div>
	</div>
{/snippet}

<!--
	Stream page: a fixed 1920x1080 stage scaled to the window, so everything is on one screen and
	nothing scrolls. The transform also confines the `fixed` overlays (reveal, stinger, coin flip)
	to the stage and scales them with it.
-->
<div class="fixed inset-0 overflow-hidden">
	<div
		class="absolute top-1/2 left-1/2 overflow-hidden"
		style:width="{STAGE_W}px"
		style:height="{STAGE_H}px"
		style:transform="translate(-50%, -50%) scale({scale})"
	>
		{#if client.kicked || client.rejected}
			<div class="flex h-full flex-col items-center justify-center gap-4 text-center">
				<div class="heading text-5xl">Stream unavailable</div>
				<div class="text-2xl text-paper/60">
					{client.rejected || 'The room has closed.'}
				</div>
			</div>
		{:else if room}
			<div class="grid h-full grid-rows-[200px_minmax(0,1fr)_124px] gap-5 p-7">
				<header class="grid min-h-0 grid-cols-[470px_minmax(0,1fr)_470px] gap-5">
					{@render banner('A')}
					<div
						class="corners relative flex min-w-0 flex-col items-center justify-center gap-3 overflow-hidden border-y-2 bg-panel/90 px-8 text-center transition-colors duration-300 {turn
							? teamBorder(turn.team)
							: 'border-brass/50'}"
						style:--slide-from={turn?.team === 'B' ? '80px' : '-80px'}
					>
						{#key status}
							<span class="pointer-events-none absolute inset-y-0 left-0 w-1/3 animate-shine bg-paper/10"
							></span>
						{/key}
						<div class="divider w-full max-w-2xl">
							<span class="font-display text-2xl leading-none font-semibold tracking-[0.35em] text-paper/60 uppercase">
								{phaseLabel}
							</span>
						</div>
						{#key status}
							<div
								class="heading max-w-full animate-slide truncate px-2 text-[56px] leading-tight {turn
									? teamText(turn.team)
									: ''}"
							>
								{status}
							</div>
						{/key}
						{#if secondsLeft !== null && msLeft !== null}
							<div class="flex w-full max-w-xl items-center gap-4" role="timer">
								<div
									class="flex h-3 flex-1 justify-center bg-line/50 [mask-image:repeating-linear-gradient(90deg,#000_0_7px,transparent_7px_10px)]"
								>
									<div
										class="h-full transition-[width] duration-200 ease-linear {urgent
											? 'bg-red-500'
											: turn
												? teamBg(turn.team)
												: 'bg-paper'}"
										style:width="{(msLeft / (room.turnSeconds * 1000)) * 100}%"
									></div>
								</div>
								<span
									class="w-14 text-right font-display text-5xl leading-none font-bold tabular-nums {urgent
										? 'animate-pulse text-red-400'
										: 'text-paper'}">{secondsLeft}</span
								>
							</div>
						{/if}
					</div>
					{@render banner('B')}
				</header>

				<div class="grid min-h-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] gap-6">
					{@render roster('A')}
					<div class="flex flex-col items-center justify-center gap-3">
						<span class="w-px flex-1 bg-brass/40"></span>
						<span class="heading text-2xl text-brass">vs</span>
						<span class="w-px flex-1 bg-brass/40"></span>
					</div>
					{@render roster('B')}
				</div>

				<footer class="grid min-h-0 grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,1fr)] items-center gap-6">
					{@render bans('A')}
					<div
						class="line-clamp-3 text-center font-display text-2xl leading-tight font-semibold tracking-wide text-paper/80"
					>
						{considering}
					</div>
					{@render bans('B')}
				</footer>
			</div>

			{#if room.phase !== 'lobby'}
				{#if room.last}
					{#key room.last.seq}
						<Reveal last={room.last} />
					{/key}
				{/if}
				{#if room.phase === 'flip' && room.firstPick}
					<CoinFlip
				winner={room.firstPick}
				format={room.format}
				delay={room.last ? FLIP_REVEAL_DELAY_S : 0}
			/>
				{:else}
					{#key room.phase}
						<!-- wait for the reveal band of a ban or pick that led straight into this phase -->
						<Stinger
							title={room.phase === 'ban'
								? 'Ban phase'
								: room.phase === 'pick'
									? 'Pick phase'
									: 'Draft complete'}
							delay={room.phase === 'done' || (room.format !== 'casual' && room.last) ? 1.9 : 0}
						/>
					{/key}
				{/if}
			{/if}
		{:else}
			<div class="flex h-full items-center justify-center text-3xl text-paper/50">Connecting…</div>
		{/if}
	</div>
</div>
