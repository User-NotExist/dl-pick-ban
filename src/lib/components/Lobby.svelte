<script lang="ts">
	import { LANE_STYLE } from '#lib/lanes.ts';
	import { PATRON_ART, PATRON_COLOR } from '#lib/patrons.ts';
	import type { RoomClient } from '#lib/room.svelte.ts';
	import {
		LANES,
		SLOTS_PER_LANE,
		TEAM_NAMES,
		TEAM_SIZE,
		TURN_TIME_OPTIONS,
		type Player,
		type RoomState,
		type Team
	} from '#lib/types.ts';

	let { room, client }: { room: RoomState; client: RoomClient } = $props();

	const isHost = $derived(room.hostId === room.you);
	const teamA = $derived(room.players.filter((p) => p.team === 'A'));
	const teamB = $derived(room.players.filter((p) => p.team === 'B'));
	const me = $derived(room.players.find((p) => p.id === room.you));
	const spectators = $derived(room.players.filter((p) => !p.team));

	/**
	 * Seat indexes within a lane, first seat first. The first seat is the front row, next to the
	 * midline, for both teams, so the top team renders them in reverse.
	 */
	const SEATS = Array.from({ length: SLOTS_PER_LANE }, (_, i) => i);

	const blocker = $derived.by(() => {
		if (!teamA.length || !teamB.length) return 'Each team needs at least one player';
		return '';
	});

	// Host seating: drag a player onto a slot, or tap a player and then tap a destination.
	let picked = $state<string | null>(null);
	let dragging = $state<string | null>(null);
	let dropTarget = $state<string | null>(null);
	/** the player being moved, if they are still in the room */
	const moving = $derived(
		isHost ? room.players.find((p) => p.id === (dragging ?? picked)) : undefined
	);

	function moveTo(id: string | null | undefined, team: Team | null, slot?: number) {
		if (isHost && id) client.send({ type: 'move', id, team, slot });
		picked = null;
		dragging = null;
		dropTarget = null;
	}

	/** drag-and-drop handlers for a destination; `key` identifies it for the hover highlight */
	function dropZone(key: string, team: Team | null, slot?: number) {
		return {
			ondragover: (e: DragEvent) => {
				if (!dragging) return;
				e.preventDefault();
				dropTarget = key;
			},
			ondragleave: () => {
				if (dropTarget === key) dropTarget = null;
			},
			ondrop: (e: DragEvent) => {
				e.preventDefault();
				moveTo(dragging ?? e.dataTransfer?.getData('text/plain'), team, slot);
			}
		};
	}

	function dragStart(e: DragEvent, id: string) {
		dragging = id;
		picked = null;
		e.dataTransfer?.setData('text/plain', id);
		if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
	}

	// Fake players: the host names one, it appears under Spectators and is seated like anyone else.
	let addingFake = $state(false);
	let fakeName = $state('');
	function addFake(e: SubmitEvent) {
		e.preventDefault();
		const name = fakeName.trim();
		if (!name) return;
		client.send({ type: 'addFake', name });
		fakeName = '';
		addingFake = false;
	}

	let copied = $state(false);
	async function copyLink() {
		try {
			await navigator.clipboard.writeText(location.href);
			copied = true;
			setTimeout(() => (copied = false), 1500);
		} catch {
			// clipboard unavailable; the code is visible on screen
		}
	}
</script>

<!-- Player name. For the host it is a drag handle and a tap target for tap-to-move. -->
{#snippet nameTag(p: Player, onDropHere: () => void)}
	{#if isHost}
		<button
			type="button"
			draggable="true"
			ondragstart={(e) => dragStart(e, p.id)}
			ondragend={() => {
				dragging = null;
				dropTarget = null;
			}}
			onclick={() => {
				if (picked && picked !== p.id) onDropHere();
				else picked = picked === p.id ? null : p.id;
			}}
			aria-pressed={picked === p.id}
			title="Drag to a slot, or click and then click a destination"
			class="min-w-0 flex-1 cursor-grab truncate text-left text-sm active:cursor-grabbing {p.id ===
			room.you
				? 'font-bold'
				: ''}"
		>
			{p.name}
		</button>
	{:else}
		<span
			class="min-w-0 flex-1 truncate text-sm {p.id === room.you ? 'font-bold' : ''}"
			title={p.name}
		>
			{p.name}
			{#if p.id === room.you && !p.team}<span class="font-normal text-paper/50">(you)</span>{/if}
		</span>
	{/if}
{/snippet}

{#snippet badges(p: Player)}
	{#if p.id === room.hostId}
		<span class="rounded border border-line px-1 text-[10px] text-paper/70">host</span>
	{/if}
	{#if p.fake}
		<span
			class="rounded border border-line px-1 text-[10px] text-paper/70"
			title="Fake player: the host bans and picks for them">fake</span
		>
	{:else if !p.online}
		<span class="text-[10px] text-paper/60">offline</span>
	{/if}
	{#if p.id === room.you && p.team}
		<button
			onclick={() => client.send({ type: 'setTeam', team: null })}
			class="px-1 text-paper/50 hover:text-paper"
			aria-label="Leave slot"
			title="Leave slot">✕</button
		>
	{:else if isHost && p.id !== room.you}
		<button
			onclick={() => client.send({ type: 'kick', id: p.id })}
			class="px-1 text-paper/50 hover:text-red-400"
			aria-label="Remove {p.name}"
			title="Remove player">✕</button
		>
	{/if}
{/snippet}

<!-- Patron art strip. The art has a flat background, so the strip continues it to full width. -->
{#snippet banner(team: Team)}
	<h2 class="flex h-20 justify-center sm:h-28" style:background-color={PATRON_COLOR[team]}>
		<img
			src={PATRON_ART[team]}
			alt={TEAM_NAMES[team]}
			width="1280"
			height="960"
			class="aspect-[7/2] h-full w-auto max-w-full object-cover object-[50%_40%]"
		/>
	</h2>
{/snippet}

{#snippet seat(team: Team, players: Player[], laneIndex: number, i: number)}
	{@const lane = LANES[laneIndex]}
	{@const style = LANE_STYLE[lane.id]}
	{@const slot = laneIndex * SLOTS_PER_LANE + i}
	{@const p = players.find((x) => x.slot === slot)}
	{#if p}
		<div
			class="flex h-11 min-w-0 animate-pop items-center gap-1 rounded border-l-4 bg-ink/60 px-2 {style.border} {p.online ||
			p.fake
				? ''
				: 'opacity-50'} {moving?.id === p.id ? 'ring-2 ring-paper' : ''} {dropTarget ===
			`${team}${slot}`
				? 'bg-paper/20'
				: ''}"
			{...isHost ? dropZone(`${team}${slot}`, team, slot) : {}}
		>
			{@render nameTag(p, () => moveTo(picked, team, slot))}
			{@render badges(p)}
		</div>
	{:else}
		<button
			onclick={() =>
				moving ? moveTo(moving.id, team, slot) : client.send({ type: 'setTeam', team, slot })}
			class="h-11 min-w-0 rounded border border-dashed px-2 text-sm text-paper/50 transition hover:bg-paper/5 hover:text-paper {style.border} {dropTarget ===
			`${team}${slot}`
				? 'bg-paper/20 text-paper'
				: ''}"
			aria-label={moving
				? `Move ${moving.name} to ${lane.name} slot ${i + 1} on ${TEAM_NAMES[team]}`
				: `Take ${lane.name} slot ${i + 1} on ${TEAM_NAMES[team]}`}
			{...isHost ? dropZone(`${team}${slot}`, team, slot) : {}}
		>
			{moving ? 'Move here' : 'Take slot'}
		</button>
	{/if}
{/snippet}

<!-- One team's half of the board: a row per seat, a column per lane. -->
{#snippet teamRows(team: Team, players: Player[], seats: number[])}
	<div class="grid grid-cols-3 gap-2" role="group" aria-label={TEAM_NAMES[team]}>
		{#each seats as i (i)}
			{#each LANES as lane, laneIndex (lane.id)}
				{@render seat(team, players, laneIndex, i)}
			{/each}
		{/each}
	</div>
{/snippet}

<div class="flex animate-rise flex-col gap-6">
	<div class="flex flex-wrap items-center gap-3">
		<h1 class="heading text-4xl leading-none">
			Room <span class="tracking-[0.2em] text-amber-team not-italic">{room.code}</span>
		</h1>
		<button
			onclick={copyLink}
			class="btn btn-ghost btn-sm"
		>
			{copied ? 'Copied' : 'Copy invite link'}
		</button>
		<span class="text-sm text-paper/50">
			{teamA.length + teamB.length} / 12 players · {spectators.length} spectating
		</span>
	</div>

	<!-- Top-down board: the Archmother at the top, the Hidden King at the bottom, lanes as columns. -->
	<section class="flex flex-col overflow-hidden border-y-4 border-t-sapphire-team border-b-amber-team bg-panel/90">
		{@render banner('B')}
		<div class="flex flex-col gap-3 p-3 sm:p-4">
			<div class="text-sm text-paper/50">{teamB.length}/{TEAM_SIZE} players</div>
			{@render teamRows('B', teamB, [...SEATS].reverse())}
			<div class="grid grid-cols-3 gap-2 py-1">
				{#each LANES as lane (lane.id)}
					{@const style = LANE_STYLE[lane.id]}
					<div class="flex min-w-0 items-center gap-1.5 font-display text-base leading-tight font-bold tracking-wider uppercase sm:text-lg {style.text}">
						<span class="h-px min-w-0 flex-1 bg-line"></span>
						<span class="h-2.5 w-2.5 shrink-0 rounded-full {style.bg}"></span>
						{lane.name}
						<span class="h-px min-w-0 flex-1 bg-line"></span>
					</div>
				{/each}
			</div>
			{@render teamRows('A', teamA, SEATS)}
			<div class="text-sm text-paper/50">{teamA.length}/{TEAM_SIZE} players</div>
		</div>
		{@render banner('A')}
	</section>

	<section
		class="border bg-panel/90 p-4 transition-colors {dropTarget === 'spectators'
			? 'border-paper bg-paper/10'
			: 'border-line'}"
		{...isHost ? dropZone('spectators', null) : {}}
	>
		<div class="mb-2 flex items-center justify-between gap-3">
			<h2 class="font-display text-lg font-bold tracking-wider text-paper/70 uppercase">
				Spectators <span class="font-normal">({spectators.length})</span>
			</h2>
			{#if moving?.team}
				<button
					onclick={() => moveTo(moving.id, null)}
					class="btn btn-primary btn-sm"
				>
					Move {moving.name} here
				</button>
			{:else if me?.team}
				<button
					onclick={() => client.send({ type: 'setTeam', team: null })}
					class="btn btn-ghost btn-sm"
				>
					Spectate
				</button>
			{:else}
				<span class="text-sm text-paper/50">You are spectating. Take a lane slot to play.</span>
			{/if}
		</div>
		{#if spectators.length}
			<ul class="grid gap-1.5 sm:grid-cols-2 md:grid-cols-3">
				{#each spectators as p (p.id)}
					<li
						class="flex items-center gap-1 rounded bg-ink/60 px-3 py-2 {p.online ||
						p.fake
							? ''
							: 'opacity-50'} {moving?.id === p.id ? 'ring-2 ring-paper' : ''}"
					>
						{@render nameTag(p, () => (picked = p.id))}
						{@render badges(p)}
					</li>
				{/each}
			</ul>
		{:else}
			<p class="text-sm text-paper/40">Nobody is spectating.</p>
		{/if}
	</section>

	<div class="flex flex-wrap items-center gap-3">
		{#if isHost}
			<button
				onclick={() => client.send({ type: 'shuffle' })}
				disabled={teamA.length + teamB.length < 2}
				title="Randomly splits the seated players into two teams and lanes"
				class="btn btn-ghost"
			>
				Shuffle teams
			</button>
			{#if addingFake}
				<form onsubmit={addFake} class="flex items-center gap-2">
					<!-- svelte-ignore a11y_autofocus -->
					<input
						bind:value={fakeName}
						maxlength="20"
						required
						autofocus
						autocomplete="off"
						aria-label="Fake player name"
						placeholder="Fake player name"
						onkeydown={(e) => {
							if (e.key === 'Escape') addingFake = false;
						}}
						class="w-44 rounded border border-line bg-ink px-2 py-1.5 text-sm outline-none focus:border-paper/60"
					/>
					<button class="btn btn-ghost btn-sm" disabled={!fakeName.trim()}>Add</button>
					<button type="button" class="btn btn-ghost btn-sm" onclick={() => (addingFake = false)}>
						Cancel
					</button>
				</form>
			{:else}
				<button
					onclick={() => (addingFake = true)}
					title="Adds a stand-in for someone who is not in the room. You ban and pick for them."
					class="btn btn-ghost"
				>
					Add fake player
				</button>
			{/if}
			<button
				onclick={() => client.send({ type: 'start' })}
				disabled={!!blocker}
				class="btn btn-primary px-10 text-xl"
			>
				Start draft
			</button>
			<label class="flex items-center gap-2 text-sm text-paper/70">
				Time per turn
				<select
					value={room.turnSeconds}
					onchange={(e) =>
						client.send({ type: 'setTimer', seconds: Number(e.currentTarget.value) })}
					class="rounded border border-line bg-ink px-2 py-1.5 text-paper"
				>
					{#each TURN_TIME_OPTIONS as s (s)}
						<option value={s}>{s ? `${s} seconds` : 'No limit'}</option>
					{/each}
				</select>
			</label>
			{#if blocker}<span class="text-sm text-paper/50">{blocker}</span>{/if}
		{:else}
			<span class="text-sm text-paper/60">
				Time per turn: {room.turnSeconds ? `${room.turnSeconds} seconds` : 'no limit'} ·
			</span>
			<span class="text-sm text-paper/60">
				{blocker || 'Waiting for the host to start the draft'}
			</span>
		{/if}
	</div>
	{#if isHost}
		<p class="text-sm text-paper/60" aria-live="polite">
			{#if picked && moving}
				Moving <span class="font-bold text-paper">{moving.name}</span>: click a slot, another
				player to swap, or the spectator box.
				<button class="underline" onclick={() => (picked = null)}>Cancel</button>
			{:else}
				As host you can drag players between slots, or click a player and then a destination.
				Fake players stand in for people who are not here: you pick for them, and ban for a team
				made up only of fake players.
			{/if}
		</p>
	{/if}
	<p class="text-sm text-paper/40">
		A coin flip at the start decides which team picks first. That team picks once, then the teams
		take two picks each in turn, and the first team gets the last pick. Within a team, players
		pick lane by lane from Yellow to Green, the front-row player (next to the midline) first.
		{#if room.turnSeconds}
			Each ban and pick has {room.turnSeconds} seconds: when time runs out the selected hero is
			locked in. With nothing selected, a ban is forfeited and a pick becomes a random hero.
		{/if}
	</p>
</div>
