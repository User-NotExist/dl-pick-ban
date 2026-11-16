<script lang="ts">
	import { onDestroy } from 'svelte';
	import { identity } from '#lib/identity.svelte.ts';
	import { RoomClient } from '#lib/room.svelte.ts';
	import Draft from './Draft.svelte';
	import CoinFlip from './CoinFlip.svelte';
	import Lobby from './Lobby.svelte';
	import Reveal from './Reveal.svelte';
	import Stinger from './Stinger.svelte';
	import Summary from './Summary.svelte';

	let { code }: { code: string } = $props();

	// one connection for the lifetime of this component
	// svelte-ignore state_referenced_locally
	const client = new RoomClient(code, identity.token, identity.name);
	onDestroy(() => client.close());
</script>

{#if client.kicked}
	<div class="mx-auto mt-10 max-w-sm text-center">
		<h1 class="text-xl font-bold">You were removed from this room</h1>
		<a href="/" class="mt-4 inline-block underline">Back to start</a>
	</div>
{:else if client.rejected}
	<div class="mx-auto mt-10 max-w-sm text-center">
		<h1 class="text-xl font-bold">{client.rejected}</h1>
		<div class="mt-4 flex justify-center gap-4">
			<button class="underline" onclick={() => location.reload()}>Try again</button>
			<a href="/" class="underline">Back to start</a>
		</div>
	</div>
{:else if client.state}
	{#if !client.connected}
		<p class="mb-3 rounded border border-line bg-panel px-3 py-2 text-sm text-paper/70">
			Connection lost. Reconnecting…
		</p>
	{/if}
	{@const room = client.state}
	{#if room.phase === 'lobby'}
		<Lobby {room} {client} />
	{:else}
		<!-- On the last pick the draft stays up behind the reveal, then the stinger swaps in the summary. -->
		<div class={room.phase === 'done' ? 'animate-leave' : ''}>
			<Draft {room} {client} />
		</div>
		{#if room.phase === 'done'}
			<Summary {room} {client} />
		{/if}
		{#if room.last}
			{#key room.last.seq}
				<Reveal last={room.last} />
			{/key}
		{/if}
		{#if room.phase === 'flip' && room.firstPick}
			<CoinFlip winner={room.firstPick} />
		{:else}
			{#key room.phase}
				<!-- after the final pick, wait for its reveal band before wiping to the summary -->
				<Stinger
					title={room.phase === 'ban'
						? 'Ban phase'
						: room.phase === 'pick'
							? 'Pick phase'
							: 'Draft complete'}
					delay={room.phase === 'done' ? 1.9 : 0}
				/>
			{/key}
		{/if}
	{/if}
	{#if client.error}
		<p
			role="alert"
			class="fixed bottom-4 left-1/2 z-20 -translate-x-1/2 rounded bg-red-700 px-4 py-2 text-sm font-semibold shadow-lg"
		>
			{client.error}
		</p>
	{/if}
{:else}
	<p class="mt-10 text-center text-paper/50">Connecting…</p>
{/if}
