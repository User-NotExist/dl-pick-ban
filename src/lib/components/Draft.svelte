<script lang="ts">
	import PatronBanner from './PatronBanner.svelte';
	import { HEROES, HERO_BY_ID } from '#lib/heroes.ts';
	import { LANE_STYLE } from '#lib/lanes.ts';
	import type { RoomClient } from '#lib/room.svelte.ts';
	import {
		BANS_PER_TEAM,
		TEAM_NAMES,
		laneOfSlot,
		type Player,
		type RoomState,
		type Team
	} from '#lib/types.ts';

	let { room, client }: { room: RoomState; client: RoomClient } = $props();

	const me = $derived(room.players.find((p) => p.id === room.you));
	const isHost = $derived(room.hostId === room.you);
	const done = $derived(room.phase === 'done');
	const turn = $derived(room.turn);

	/** the one player due to pick, during the pick phase */
	const picker = $derived(
		turn?.type === 'pick' ? room.players.find((p) => p.id === turn.playerId) : undefined
	);
	/** the host may pick for a disconnected player */
	const proxy = $derived(!!picker && picker.id !== room.you && isHost && !picker.online);

	const banned = $derived(new Set(room.bans.map((b) => b.hero)));
	const pickedBy = $derived(
		new Map(room.players.filter((p) => p.hero).map((p) => [p.hero as string, p]))
	);

	const canAct = $derived.by(() => {
		if (!turn || !me) return false;
		if (turn.type === 'ban') return me.team === turn.team;
		return picker?.id === me.id || proxy;
	});

	/** may mark a hero: the team on turn (teammates can suggest during picks), or the host as proxy */
	const canSelect = $derived(!!turn && !!me && (me.team === turn.team || proxy));

	/**
	 * Whose selection counts as "the" pending pick: the player on turn, or the host while
	 * that player is offline. Other teammates' selections are suggestions. In a ban every
	 * teammate's selection counts equally.
	 */
	const leadId = $derived(
		turn?.type === 'pick' ? (picker && !picker.online ? room.hostId : picker?.id) : undefined
	);

	// The server only sends selections to the acting team and to spectators.
	const marks = $derived(
		room.selections.flatMap((s) => {
			const player = room.players.find((p) => p.id === s.playerId);
			const hero = HERO_BY_ID.get(s.hero);
			if (!player || !hero) return [];
			const lead = turn?.type === 'ban' || player.id === leadId;
			return [{ player, hero, lead, mine: player.id === room.you }];
		})
	);
	const marksByHero = $derived.by(() => {
		const map = new Map<string, typeof marks>();
		for (const m of marks) map.set(m.hero.id, [...(map.get(m.hero.id) ?? []), m]);
		return map;
	});
	const mySelection = $derived(marks.find((m) => m.mine)?.hero.id ?? null);
	const choice = $derived(canAct ? mySelection : null);

	/** hero shown as a ghost in the picker's seat / the next ban slot */
	const ghost = $derived(
		turn?.type === 'pick' ? marks.find((m) => m.lead)?.hero : marks.filter((m) => m.lead).at(-1)?.hero
	);

	const who = (m: { player: Player; mine: boolean }) => (m.mine ? 'You' : m.player.name);
	const considering = $derived.by(() => {
		if (!turn || !marks.length) return '';
		if (turn.type === 'ban')
			return 'Considering: ' + marks.map((m) => `${m.hero.name} (${who(m)})`).join(', ');
		const lead = marks.find((m) => m.lead);
		const suggestions = marks.filter((m) => !m.lead);
		return [
			lead && `${who(lead)} ${lead.mine ? 'are' : 'is'} considering ${lead.hero.name}`,
			suggestions.length &&
				'Suggested: ' + suggestions.map((m) => `${m.hero.name} (${who(m)})`).join(', ')
		]
			.filter(Boolean)
			.join(' · ');
	});

	const status = $derived.by(() => {
		if (room.phase === 'flip') return 'Coin flip';
		if (!turn) return 'Draft complete';
		const team = TEAM_NAMES[turn.team];
		if (turn.type === 'ban') {
			return `${team} ban`;
		}
		return `${picker?.name ?? team} picks`;
	});

	const phaseLabel = $derived.by(() => {
		if (room.phase === 'flip') return 'First pick';
		if (turn?.type === 'ban') return `Ban phase · ${room.bans.length + 1} / ${BANS_PER_TEAM * 2}`;
		if (turn?.type === 'pick') {
			const seated = room.players.filter((p) => p.team);
			return `Pick phase · ${seated.filter((p) => p.hero).length + 1} / ${seated.length}`;
		}
		return '';
	});

	const hint = $derived.by(() => {
		if (room.phase === 'flip') return 'Deciding which team picks first';
		if (!turn) return '';
		if (turn.type === 'ban') {
			if (!me?.team) return 'You are spectating';
			return canAct ? 'Your team bans: choose a hero' : 'Waiting for the other team';
		}
		if (picker?.id === room.you) return 'Your turn: pick your hero';
		if (proxy) return `${picker?.name} is offline. As host you can pick for them.`;
		if (picker && !picker.online) return `${picker.name} is offline. The host can pick for them.`;
		if (!me?.team) return 'You are spectating';
		return canSelect
			? `Waiting for ${picker?.name}. Click a hero to suggest it.`
			: `Waiting for ${picker?.name}`;
	});

	function confirm() {
		if (!choice || !turn) return;
		client.send({ type: turn.type, hero: choice });
	}

	function select(hero: string) {
		client.send({ type: 'select', hero: mySelection === hero ? null : hero });
	}

	const teamText = (t: Team) => (t === 'A' ? 'text-amber-team' : 'text-sapphire-team');
	const teamBorder = (t: Team) => (t === 'A' ? 'border-amber-team' : 'border-sapphire-team');
</script>

{#snippet banSlots(team: Team)}
	{@const bans = room.bans.filter((b) => b.team === team)}
	<div class="flex gap-2">
		{#each { length: BANS_PER_TEAM }, i}
			{@const hero = bans[i] ? HERO_BY_ID.get(bans[i].hero) : undefined}
			{@const pending = turn?.type === 'ban' && turn.team === team && i === bans.length ? ghost : undefined}
			<div
				class="relative flex aspect-[14/19] w-12 items-center justify-center overflow-hidden rounded border border-dashed border-line bg-ink/60 text-xs text-paper/30 sm:w-14"
				title={hero ? `${hero.name} (banned)` : 'Ban slot'}
			>
				{#if hero}
					<img
						src={hero.banned}
						alt="{hero.name} banned"
						class="h-full w-full animate-pop object-cover"
					/>
					<span class="absolute inset-0 animate-wash bg-red-600/25"></span>
				{:else if pending}
					<img
						src={pending.card}
						alt="Considering {pending.name}"
						title="Considering {pending.name}"
						class="h-full w-full animate-pulse object-cover opacity-60"
					/>
				{:else}
					ban
				{/if}
			</div>
		{/each}
	</div>
{/snippet}

{#snippet seat(p: Player, team: Team)}
	{@const order = room.pickOrder.indexOf(p.id) + 1}
	{@const hero = p.hero ? HERO_BY_ID.get(p.hero) : undefined}
	{@const lane = laneOfSlot(p.slot ?? 0)}
	{@const style = LANE_STYLE[lane.id]}
	{@const picking = picker?.id === p.id}
	{@const pending = picking ? ghost : undefined}
	<!-- Team B is mirrored so both rosters face the hero pool, as on a broadcast overlay. -->
	<li
		class="flex h-14 items-center gap-2 overflow-hidden bg-panel/90 transition sm:h-16 {style.border} {team ===
		'B'
			? 'flex-row-reverse border-r-4 text-right'
			: 'border-l-4'} {picking ? 'animate-glow ring-2 ring-paper' : ''} {p.online
			? ''
			: 'opacity-50'}"
	>
		<div
			class="flex aspect-[14/19] h-full shrink-0 items-center justify-center overflow-hidden bg-line/40 text-paper/30"
		>
			{#if hero}
				<img src={hero.card} alt="" class="h-full w-full animate-pop object-cover" />
			{:else if pending}
				<img src={pending.card} alt="" class="h-full w-full animate-pulse object-cover opacity-60" />
			{:else}
				?
			{/if}
		</div>
		<div class="min-w-0 flex-1">
			<div class="truncate font-display text-lg leading-tight font-bold tracking-wide uppercase sm:text-xl">
				{p.name}
				{#if p.id === room.you}<span class="font-semibold text-paper/50">(you)</span>{/if}
			</div>
			<div class="truncate text-xs text-paper/60">
				<span class="font-semibold {style.text}">{lane.name}</span>
				· {hero
					? hero.name
					: pending
						? `${pending.name}?`
						: picking
							? 'picking now'
							: p.online
								? 'no hero yet'
								: 'offline'}
			</div>
		</div>
		<span
			class="heading hidden px-2 text-3xl lg:block {picking ? 'text-paper' : 'text-paper/25'}"
			title="Pick order">{order || ''}</span
		>
	</li>
{/snippet}

{#snippet teamHead(team: Team)}
	<section
		class="flex flex-col overflow-hidden border-t-4 bg-panel/90 transition {team === 'A'
			? '[grid-area:ha]'
			: '[grid-area:hb]'} {teamBorder(team)} {turn?.team === team ? 'animate-glow' : 'opacity-80'}"
		style:--glow-color={team === 'B' ? 'var(--color-sapphire-team)' : 'var(--color-amber-team)'}
	>
		<PatronBanner {team} class="aspect-[3/1] lg:aspect-[5/2]" />
		<div class="flex items-center justify-between gap-2 p-2 {team === 'B' ? 'flex-row-reverse' : ''}">
			<div class="flex min-w-0 flex-col {team === 'B' ? 'items-end' : ''}">
				<span class="font-display text-sm font-bold tracking-[0.25em] text-paper/50 uppercase"
					>Bans</span
				>
				{#if room.firstPick === team && room.phase !== 'flip'}
					<span
						class="slant px-2 font-display text-xs font-bold tracking-wider whitespace-nowrap text-ink uppercase {team ===
						'A'
							? 'bg-amber-team'
							: 'bg-sapphire-team'}"
						title="Won the coin flip: picks first and last">First pick</span
					>
				{/if}
			</div>
			{@render banSlots(team)}
		</div>
	</section>
{/snippet}

{#snippet teamSeats(team: Team)}
	{@const players = room.players
		.filter((p) => p.team === team)
		.sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0))}
	<ul
		class="flex flex-col gap-2 {team === 'A' ? '[grid-area:sa]' : '[grid-area:sb]'}"
		aria-label="{TEAM_NAMES[team]} players in pick order"
	>
		{#each players as p (p.id)}
			{@render seat(p, team)}
		{/each}
	</ul>
{/snippet}

<!--
	Broadcast scoreboard layout. Desktop: team header | status | team header over
	roster | hero pool | roster. Phones: status on top (sticky), the two teams side by side, then the pool.
-->
<div
	class="grid animate-rise grid-cols-2 gap-3 [animation-delay:0.5s] [grid-template-areas:'st_st'_'ha_hb'_'sa_sb'_'gr_gr'] lg:grid-cols-[15rem_minmax(0,1fr)_15rem] lg:gap-4 lg:[grid-template-areas:'ha_st_hb'_'sa_gr_sb']"
>
	{@render teamHead('A')}

	<div
		class="sticky top-0 z-10 flex flex-col items-center justify-center gap-1 overflow-hidden border-b-4 bg-panel/95 px-4 py-3 text-center backdrop-blur transition-colors duration-300 [grid-area:st] {turn
			? teamBorder(turn.team)
			: 'border-line'} {canAct ? 'animate-glow' : ''}"
		style:--glow-color={turn?.team === 'B' ? 'var(--color-sapphire-team)' : 'var(--color-amber-team)'}
		style:--slide-from={turn?.team === 'B' ? '80px' : '-80px'}
	>
		{#key status}
			<span class="pointer-events-none absolute inset-y-0 left-0 w-1/3 animate-shine bg-white/15"
			></span>
		{/key}
		{#if phaseLabel}
			<div class="font-display text-sm font-semibold tracking-[0.35em] text-paper/60 uppercase">
				{phaseLabel}
			</div>
		{/if}
		{#key status}
			<div
				class="heading animate-slide text-3xl leading-none sm:text-5xl {turn
					? teamText(turn.team)
					: ''}"
			>
				{status}
			</div>
		{/key}
		{#if hint}<div class="text-sm {canAct ? 'text-paper' : 'text-paper/50'}">{hint}</div>{/if}
		{#if considering}
			<div class="max-w-full truncate text-sm font-semibold text-paper/80" aria-live="polite">
				{considering}
			</div>
		{/if}
		{#if (canAct && turn) || isHost}
			<div class="mt-1 flex flex-wrap items-center justify-center gap-2">
				{#if canAct && turn}
					<button
						onclick={confirm}
						disabled={!choice}
						class="btn {turn.type === 'ban' ? 'btn-danger' : 'btn-primary'} px-8"
					>
						{#if choice}
							{turn.type === 'ban' ? 'Ban' : 'Pick'}
							{HERO_BY_ID.get(choice)?.name}
							{#if proxy}for {picker?.name}{/if}
						{:else}
							Select a hero
						{/if}
					</button>
				{/if}
				{#if isHost}
					<button onclick={() => client.send({ type: 'reset' })} class="btn btn-ghost btn-sm">
						{done ? 'New draft' : 'Cancel draft'}
					</button>
				{/if}
			</div>
		{/if}
	</div>

	{@render teamHead('B')}
	{@render teamSeats('A')}

	<div
		class="grid grid-cols-4 content-start gap-2 [grid-area:gr] sm:grid-cols-6 xl:grid-cols-8"
		style:--glow-color={turn?.team === 'B'
			? 'var(--color-sapphire-team)'
			: 'var(--color-amber-team)'}
	>
			{#each HEROES as hero (hero.id)}
				{@const isBanned = banned.has(hero.id)}
				{@const owner = pickedBy.get(hero.id)}
				{@const available = !isBanned && !owner}
				{@const heroMarks = available ? (marksByHero.get(hero.id) ?? []) : []}
				{@const leadMark = heroMarks.some((m) => m.lead)}
				<button
					type="button"
					disabled={!canSelect || !available}
					onclick={() => select(hero.id)}
					aria-pressed={mySelection === hero.id}
					title={hero.name}
					class="group relative aspect-[14/19] overflow-hidden border-2 bg-panel transition duration-200
						{mySelection === hero.id
						? 'scale-105 border-paper'
						: isBanned
							? 'border-red-600'
							: owner?.team
								? teamBorder(owner.team)
								: heroMarks.length && turn
									? `${teamBorder(turn.team)} ${leadMark ? '' : 'border-dashed'}`
									: 'border-transparent'}
						{leadMark ? 'animate-glow' : ''}
						{canSelect && available
						? 'cursor-pointer hover:-translate-y-1 hover:border-paper/60 hover:shadow-lg'
						: 'cursor-default'}"
				>
					<img
						src={isBanned ? hero.banned : hero.card}
						alt={hero.name}
						loading="lazy"
						class="h-full w-full object-cover transition-opacity duration-500 {owner
							? 'opacity-35'
							: ''} {!available ||
						canSelect ||
						heroMarks.length ||
						done
							? ''
							: 'opacity-80'}"
					/>
					{#if isBanned}
						<span class="absolute inset-0 animate-wash bg-red-600/25"></span>
						<span
							class="absolute top-1/2 left-[-20%] h-1 w-[140%] -rotate-[52deg] animate-slash bg-red-500/90"
						></span>
						<span
							class="absolute inset-x-0 top-0 animate-wash bg-red-700 py-0.5 text-center text-[10px] font-bold tracking-wider"
							>BANNED</span
						>
					{:else if owner?.team}
						<span class="absolute inset-y-0 left-0 w-1/2 animate-shine bg-white/40"></span>
						<span
							class="absolute inset-x-0 top-0 animate-wash truncate bg-ink/85 px-1 py-0.5 text-center text-[11px] font-semibold {teamText(
								owner.team
							)}">{owner.name}</span
						>
					{:else if heroMarks.length && turn}
						<!-- pending selection: solid tag for the acting player(s), outlined for suggestions -->
						<span
							class="absolute inset-x-0 top-0 animate-wash truncate px-1 py-0.5 text-center text-[11px] font-bold {leadMark
								? turn.team === 'A'
									? 'bg-amber-team text-ink'
									: 'bg-sapphire-team text-ink'
								: `bg-ink/85 italic ${teamText(turn.team)}`}"
							>{heroMarks.map(who).join(', ')}{leadMark ? '' : '?'}</span
						>
					{/if}
					<span
						class="absolute inset-x-0 bottom-0 truncate bg-ink/80 px-1 py-0.5 text-center font-display text-sm leading-tight font-semibold tracking-wide uppercase {isBanned
							? 'text-red-300 line-through'
							: owner
								? 'text-paper/60'
								: 'text-paper'}">{hero.name}</span
					>
				</button>
			{/each}
	</div>

	{@render teamSeats('B')}
</div>
