<script lang="ts">
	import { untrack } from 'svelte';
	import PatronBanner from './PatronBanner.svelte';
	import TurnCue from './TurnCue.svelte';
	import { HEROES, HERO_BY_ID, RANDOM } from '#lib/heroes.ts';
	import { LANE_STYLE } from '#lib/lanes.ts';
	import type { RoomClient } from '#lib/room.svelte.ts';
	import { Roll, rollCandidates } from '#lib/roll.svelte.ts';
	import {
		RANDOM_ROLL_S,
		TEAM_NAMES,
		TURN_GRACE_S,
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

	/** the host bans for a team made up only of fake players */
	const hostBans = $derived.by(() => {
		if (!isHost || turn?.type !== 'ban') return false;
		const team = room.players.filter((p) => p.team === turn.team);
		return team.length > 0 && team.every((p) => p.fake);
	});

	const banned = $derived(new Set(room.bans.map((b) => b.hero)));

	// A random pick first plays a roulette over the pool: the highlight hops between the heroes
	// that were free and lands on the rolled one. Until it lands, that hero still looks free.
	const roll = new Roll();
	const lastSeq = $derived(room.last?.seq);
	$effect(() => {
		if (lastSeq === undefined) return; // restarts on each new ban or pick, not on every snapshot
		const last = untrack(() => room.last);
		if (last?.type === 'pick' && last.random) roll.start(last, untrack(() => rollCandidates(room, last)));
		return () => roll.stop();
	});
	/** the rolled hero, while the roulette has not landed on it yet */
	const rolling = $derived(roll.active && !roll.landed ? (room.last?.hero ?? undefined) : undefined);
	const rollPool = $derived(new Set(roll.candidates));
	const rollColor = $derived(
		room.last?.team === 'B' ? 'var(--color-sapphire-team)' : 'var(--color-amber-team)'
	);

	// Turn clock. The extra grace the server allows is hidden: the display holds at the full
	// limit while the previous reveal plays, then counts down.
	let now = $state(Date.now());
	$effect(() => {
		if (client.deadline === null) return;
		now = Date.now();
		const tick = setInterval(() => (now = Date.now()), 200);
		return () => clearInterval(tick);
	});
	const msLeft = $derived(
		client.deadline === null || !turn
			? null
			: Math.max(0, Math.min(client.deadline - now, room.turnSeconds * 1000))
	);
	const secondsLeft = $derived(msLeft === null ? null : Math.ceil(msLeft / 1000));
	const urgent = $derived(secondsLeft !== null && secondsLeft <= 5);
	const pickedBy = $derived(
		new Map(
			room.players.filter((p) => p.hero && p.hero !== rolling).map((p) => [p.hero as string, p])
		)
	);

	const canAct = $derived.by(() => {
		if (!turn || !me) return false;
		if (turn.type === 'ban') return me.team === turn.team || hostBans;
		return picker?.id === me.id || proxy;
	});

	/** may mark a hero: the team on turn (teammates can suggest during picks), or the host as proxy */
	const canSelect = $derived(
		!!turn && !!me && (turn.type === 'ban' ? canAct : me.team === turn.team || proxy)
	);

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

	/** it is this viewer's turn: the status panel fills with the team colour */
	const myTurn = $derived(canAct && !!turn);
	/** a teammate is picking: this viewer can only suggest */
	const suggesting = $derived(canSelect && !canAct);

	const status = $derived.by(() => {
		if (room.phase === 'flip') return 'Coin flip';
		if (!turn) return 'Draft complete';
		const team = TEAM_NAMES[turn.team];
		if (turn.type === 'ban') {
			if (canAct) return me?.team === turn.team ? 'Your team bans' : `Ban for ${team}`;
			return `${team} ban`;
		}
		if (proxy) return `Pick for ${picker?.name}`;
		if (canAct) return 'Your pick';
		return `${picker?.name ?? team} picks`;
	});

	/** changes with every turn, so the "your turn" call-out replays */
	const turnKey = $derived(
		turn
			? `${turn.type}:${turn.type === 'ban' ? room.bans.length : room.players.filter((p) => p.hero).length}`
			: ''
	);
	/**
	 * Seconds to hold the call-out back so it follows the phase stinger (first turn of a phase)
	 * or the previous turn's reveal band, less whatever part of the turn has already passed.
	 */
	const cueDelay = $derived.by(() => {
		if (!turn) return 0;
		// first turn of a phase: nothing has happened yet, or the last thing was of the other kind
		const first = room.last?.type !== turn.type;
		// in Night Shift a phase can follow a reveal directly, and its stinger waits for that reveal
		const direct = first && !!room.last && room.format !== 'casual';
		// a random pick's roulette plays before its reveal band
		const extra = room.last?.random ? RANDOM_ROLL_S : 0;
		const lead = (direct ? 3.2 : first ? 1.3 : 2) + extra;
		if (client.deadline === null) return lead;
		const elapsed =
			room.turnSeconds + TURN_GRACE_S + extra - (client.deadline - Date.now()) / 1000;
		return Math.max(0, lead - elapsed);
	});

	const phaseLabel = $derived.by(() => {
		if (room.phase === 'flip') return room.format === 'casual' ? 'First pick' : 'Who goes first';
		if (turn?.type === 'ban') return `Ban phase · ${room.bans.length + 1} / ${room.bansPerTeam * 2}`;
		if (turn?.type === 'pick') {
			const seated = room.players.filter((p) => p.team);
			return `Pick phase · ${seated.filter((p) => p.hero).length + 1} / ${seated.length}`;
		}
		return '';
	});

	const hint = $derived.by(() => {
		if (room.phase === 'flip')
			return room.format === 'casual'
				? 'Deciding which team picks first'
				: 'Deciding which team bans and picks first';
		if (!turn) return '';
		if (turn.type === 'ban') {
			if (canAct)
				return me?.team === turn.team
					? 'Choose a hero to ban'
					: `${TEAM_NAMES[turn.team]} are all fake players. As host you ban for them.`;
			return me?.team ? 'Waiting for the other team' : 'You are spectating';
		}
		if (picker?.id === room.you) return 'Choose your hero below';
		if (proxy)
			return picker?.fake
				? `${picker.name} is a fake player. As host you pick for them.`
				: `${picker?.name} is offline. As host you can pick for them.`;
		if (picker?.fake) return `${picker.name} is a fake player. The host picks for them.`;
		if (picker && !picker.online) return `${picker.name} is offline. The host can pick for them.`;
		if (!me?.team) return 'You are spectating';
		return canSelect
			? `Waiting for ${picker?.name}. Click a hero to suggest it.`
			: `Waiting for ${picker?.name}`;
	});

	const timeoutNote = $derived.by(() => {
		if (!turn || !canAct || choice) return '';
		return turn.type === 'ban'
			? 'No ban is made if time runs out'
			: 'A random hero is picked if time runs out';
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
	const teamBg = (t: Team) => (t === 'A' ? 'bg-amber-team' : 'bg-sapphire-team');
	const teamColor = (t: Team) =>
		t === 'A' ? 'var(--color-amber-team)' : 'var(--color-sapphire-team)';
</script>

{#snippet turnTag(label: string, team: Team | null)}
	<span class="tag text-xs {team ? teamBg(team) : 'bg-paper'}">{label}</span>
{/snippet}

{#snippet banSlots(team: Team)}
	{@const bans = room.bans.filter((b) => b.team === team)}
	<div class="flex gap-2">
		{#each { length: room.bansPerTeam }, i}
			{@const hero = HERO_BY_ID.get(bans[i]?.hero ?? '')}
			{@const skipped = !!bans[i] && !bans[i].hero}
			{@const pending = turn?.type === 'ban' && turn.team === team && i === bans.length ? ghost : undefined}
			<div
				class="deco relative flex aspect-[14/19] w-10 items-center justify-center overflow-hidden border bg-ink/60 font-display text-xs tracking-widest text-paper/30 uppercase sm:w-14 {hero
					? 'border-red-700'
					: 'border-brass/40'}"
				style:--deco-color={hero ? '#dc2626' : null}
				title={hero ? `${hero.name} (banned)` : skipped ? 'Ban forfeited: time ran out' : 'Ban slot'}
			>
				{#if hero}
					<img
						src={hero.banned}
						alt="{hero.name} banned"
						class="h-full w-full animate-wash object-cover grayscale"
					/>
					<span class="absolute inset-0 animate-wash bg-red-950/30"></span>
					<span class="seal animate-stamp"></span>
				{:else if pending}
					<img
						src={pending.card}
						alt="Considering {pending.name}"
						title="Considering {pending.name}"
						class="h-full w-full animate-pulse object-cover opacity-60"
					/>
				{:else if skipped}
					<span class="text-lg leading-none" aria-label="No ban">—</span>
				{:else}
					ban
				{/if}
			</div>
		{/each}
	</div>
{/snippet}

{#snippet seat(p: Player, team: Team)}
	{@const order = room.pickOrder.indexOf(p.id) + 1}
	{@const hopping = !!rolling && p.hero === rolling ? HERO_BY_ID.get(roll.current ?? '') : undefined}
	{@const hero = p.hero && p.hero !== rolling ? HERO_BY_ID.get(p.hero) : undefined}
	{@const lane = laneOfSlot(p.slot ?? 0)}
	{@const style = LANE_STYLE[lane.id]}
	{@const picking = picker?.id === p.id}
	{@const pending = picking ? ghost : undefined}
	{@const mine = picking && canAct}
	<!-- Team B is mirrored so both rosters face the hero pool, as on a broadcast overlay. -->
	<li
		class="flex h-14 items-center gap-2 overflow-hidden border bg-panel/90 transition sm:h-16 {team ===
		'B'
			? 'flex-row-reverse text-right'
			: ''} {picking ? 'animate-glow border-transparent' : 'border-brass/25'} {p.online ||
		p.fake ||
		mine
			? ''
			: 'opacity-50'}"
		style:--glow-color={mine ? teamColor(team) : 'var(--color-paper)'}
	>
		<div
			class="flex aspect-[14/19] h-full shrink-0 items-center justify-center overflow-hidden bg-line/40 text-paper/30"
		>
			{#if hero}
				<img src={hero.card} alt="" class="h-full w-full animate-pop object-cover" />
			{:else if hopping}
				<!-- the roulette's seat follows the highlight until it lands -->
				<img src={hopping.card} alt="" class="h-full w-full object-cover opacity-60" />
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
				{#if p.fake}<span class="font-semibold text-paper/50">(fake)</span>{/if}
			</div>
			<div class="truncate text-xs text-paper/60">
				<span class="mr-0.5 inline-block size-1.5 rotate-45 align-middle {style.bg}"></span>
				<span class="font-semibold {style.text}">{lane.name}</span>
				·
				{#if picking && !hero}
					{@render turnTag(
						mine ? (p.id === room.you ? 'Your pick' : 'You pick') : 'Picking',
						mine ? team : null
					)}
					{#if pending}{pending.name}?{/if}
				{:else}
					{hero ? hero.name : hopping ? 'Rolling…' : p.online || p.fake ? 'no hero yet' : 'offline'}
				{/if}
			</div>
		</div>
		<span
			class="heading hidden px-2 text-3xl lg:block {picking ? 'text-paper' : 'text-paper/25'}"
			title="Pick order">{order || ''}</span
		>
	</li>
{/snippet}

{#snippet teamHead(team: Team)}
	<!-- three ban slots leave no room for the label beside them in the narrow column: it goes above -->
	{@const stacked = room.bansPerTeam > 2}
	<section
		class="flex flex-col overflow-hidden border-t-2 bg-panel/90 transition {team === 'A'
			? '[grid-area:ha]'
			: '[grid-area:hb]'} {teamBorder(team)} {turn?.team === team ? 'animate-glow' : 'opacity-80'}"
		style:--glow-color={team === 'B' ? 'var(--color-sapphire-team)' : 'var(--color-amber-team)'}
	>
		<div class="relative">
			<PatronBanner {team} class="aspect-[3/1] lg:aspect-[5/2]" />
			<!-- the tags sit on the banner: beside the ban slots they would not fit -->
			<div
				class="absolute inset-x-0 bottom-0 flex flex-wrap-reverse items-end justify-between gap-1 p-1.5 {team ===
				'B'
					? 'flex-row-reverse'
					: ''}"
			>
				{#if room.firstPick === team && room.phase !== 'flip'}
					<span
						class="tag text-xs {teamBg(team)}"
						title={room.format === 'casual'
							? 'Won the coin flip: picks first and last'
							: 'Won the coin flip: bans first and picks first'}
						>{room.format === 'casual' ? 'First pick' : 'Goes first'}</span
					>
				{/if}
				{#if turn?.type === 'ban' && turn.team === team}
					<!-- the auto margin keeps it on the inner side when it is the only tag -->
					<span class={team === 'B' ? 'me-auto' : 'ms-auto'}>
						{@render turnTag(canAct ? 'Your ban' : 'Banning', canAct ? team : null)}
					</span>
				{/if}
			</div>
		</div>
		<div
			class="flex gap-2 p-2 {stacked
				? `flex-col ${team === 'B' ? 'items-end' : 'items-start'}`
				: `items-center justify-between ${team === 'B' ? 'flex-row-reverse' : ''}`}"
		>
			<span class="font-display text-sm font-bold tracking-[0.25em] text-paper/50 uppercase"
				>Bans</span
			>
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

	<!-- Title card: stays dark on every turn; the team on turn colours its rules, corners and title. -->
	<div
		class="corners sticky top-0 z-10 flex flex-col items-center justify-center gap-1.5 overflow-hidden border-y-2 bg-panel/95 px-5 py-4 text-center backdrop-blur transition-colors duration-300 [grid-area:st] {turn
			? teamBorder(turn.team)
			: 'border-brass/50'} {myTurn ? 'animate-glow' : ''}"
		style:--glow-color={turn ? teamColor(turn.team) : null}
		style:--corner-color={myTurn && turn ? teamColor(turn.team) : null}
		style:--slide-from={turn?.team === 'B' ? '80px' : '-80px'}
	>
		{#key status}
			<span
				class="pointer-events-none absolute inset-y-0 left-0 w-1/3 animate-shine {myTurn
					? 'bg-paper/20'
					: 'bg-paper/10'}"
			></span>
		{/key}
		{#if phaseLabel}
			<div class="divider w-full max-w-md">
				<span class="font-display text-sm font-semibold tracking-[0.35em] text-paper/60 uppercase">
					{phaseLabel}
				</span>
			</div>
		{/if}
		{#key status}
			<div
				class="heading max-w-full animate-slide truncate leading-tight {myTurn
					? 'text-2xl sm:text-4xl xl:text-5xl'
					: 'text-2xl sm:text-3xl xl:text-4xl'} {turn ? teamText(turn.team) : ''}"
			>
				{status}
			</div>
		{/key}
		{#if secondsLeft !== null && msLeft !== null}
			<!-- a ticked line that burns down from both ends towards the centre -->
			<div
				class="flex w-full max-w-xs items-center gap-3"
				role="timer"
				aria-label="{secondsLeft} seconds left"
			>
				<div
					class="flex h-2 flex-1 justify-center bg-line/50 [mask-image:repeating-linear-gradient(90deg,#000_0_5px,transparent_5px_7px)]"
				>
					<div
						class="h-full transition-[width] duration-200 ease-linear {urgent
							? 'bg-red-500'
							: turn?.team === 'B'
								? 'bg-sapphire-team'
								: 'bg-amber-team'}"
						style:width="{(msLeft / (room.turnSeconds * 1000)) * 100}%"
					></div>
				</div>
				<span
					class="w-9 text-right font-display text-3xl leading-none font-bold tabular-nums {urgent
						? 'animate-pulse text-red-400'
						: 'text-paper'}">{secondsLeft}</span
				>
			</div>
		{/if}
		{#if hint}
			<div class="text-sm {myTurn || suggesting ? 'text-paper' : 'text-paper/50'}">
				{hint}
			</div>
		{/if}
		{#if secondsLeft !== null && timeoutNote}
			<div class="text-xs text-paper/50">{timeoutNote}</div>
		{/if}
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
			<!-- during picks the pool ends with the random card: marked and confirmed like a hero -->
			{#each turn?.type === 'pick' ? [...HEROES, RANDOM] : HEROES as hero (hero.id)}
				{@const isBanned = banned.has(hero.id)}
				{@const owner = pickedBy.get(hero.id)}
				{@const available = !isBanned && !owner}
				{@const heroMarks = available ? (marksByHero.get(hero.id) ?? []) : []}
				{@const leadMark = heroMarks.some((m) => m.lead)}
				{@const hop = roll.current === hero.id}
				{@const offRoll = roll.active && !rollPool.has(hero.id)}
				<button
					type="button"
					disabled={!canSelect || !available}
					onclick={() => select(hero.id)}
					aria-pressed={mySelection === hero.id}
					title={hero === RANDOM ? 'A random available hero, rolled when you lock it in' : hero.name}
					class="deco group relative aspect-[14/19] overflow-hidden border bg-panel transition duration-200
						{mySelection === hero.id
						? 'z-[1] scale-105 border-soul shadow-[0_0_14px_0_color-mix(in_srgb,var(--color-soul)_50%,transparent)]'
						: isBanned
							? 'border-red-900'
							: owner?.team
								? teamBorder(owner.team)
								: heroMarks.length && turn
									? `${teamBorder(turn.team)} ${leadMark ? '' : 'border-dashed'}`
									: 'border-brass/40'}
						{leadMark && mySelection !== hero.id ? 'animate-glow' : ''}
						{hop ? 'z-[2] scale-110 duration-75' : ''} {offRoll ? 'opacity-40' : ''}
						{canSelect && available
						? 'cursor-pointer hover:border-paper hover:brightness-115'
						: 'cursor-default'}"
					style:--deco-color={mySelection === hero.id
						? 'var(--color-soul)'
						: isBanned
							? '#7f1d1d'
							: owner?.team
								? teamColor(owner.team)
								: null}
					style:border-color={hop ? rollColor : null}
					style:box-shadow={hop
						? `0 0 0 2px ${rollColor}, 0 0 22px 2px color-mix(in srgb, ${rollColor} 60%, transparent)`
						: null}
				>
					<img
						src={isBanned ? hero.banned : hero.card}
						alt={hero.name}
						loading="lazy"
						class="h-full w-full object-cover transition duration-500 {isBanned
							? 'opacity-70 grayscale'
							: ''} {owner ? 'opacity-35' : ''} {!available ||
						canSelect ||
						heroMarks.length ||
						done
							? ''
							: 'opacity-80'}"
					/>
					{#if hop}
						<!-- the roulette's highlight: lights the card in the picking team's colour -->
						<span
							class="absolute inset-0 mix-blend-screen {roll.landed ? 'animate-wash' : ''}"
							style:background-color="color-mix(in srgb, {rollColor} 25%, transparent)"
						></span>
						{#if roll.landed}
							<span class="absolute inset-y-0 left-0 w-1/2 animate-shine bg-paper/50"></span>
						{/if}
					{/if}
					{#if isBanned}
						<!-- struck from the pool: drained of colour and stamped, like a closed case file -->
						<span class="absolute inset-0 animate-wash bg-red-950/30"></span>
						<span class="seal animate-stamp"></span>
					{:else if owner?.team}
						<span class="absolute inset-y-0 left-0 w-1/2 animate-shine bg-paper/40"></span>
						<span
							class="absolute inset-x-0 top-0 animate-wash truncate bg-ink/85 px-1 py-0.5 text-center text-[11px] font-semibold {teamText(
								owner.team
							)}">{owner.name}</span
						>
					{:else if heroMarks.length && turn}
						<!-- pending selection: solid tag for the acting player(s), outlined for suggestions -->
						<span
							class="absolute inset-x-0 top-0 animate-wash truncate px-1 py-0.5 text-center text-[11px] font-bold {leadMark
								? `${teamBg(turn.team)} text-ink`
								: `bg-ink/85 ${teamText(turn.team)}`}"
							>{heroMarks.map(who).join(', ')}{leadMark ? '' : '?'}</span
						>
					{/if}
					<!-- name plaque -->
					<span
						class="chamfer absolute inset-x-1.5 bottom-1.5 truncate px-1 py-0.5 text-center font-display text-sm leading-tight font-bold tracking-wide uppercase [--cut:4px] {isBanned
							? 'bg-ink/90 text-red-300/80 line-through'
							: owner
								? 'bg-ink/85 text-paper/60'
								: 'bg-paper/95 text-ink'}">{hero.name}</span
					>
				</button>
			{/each}
	</div>

	{@render teamSeats('B')}
</div>

{#if myTurn && turn}
	{#key turnKey}
		<TurnCue
			team={turn.team}
			title={status}
			eyebrow={turn.type === 'ban' ? 'Your turn to ban' : 'Your turn to pick'}
			delay={cueDelay}
		/>
	{/key}
{/if}
