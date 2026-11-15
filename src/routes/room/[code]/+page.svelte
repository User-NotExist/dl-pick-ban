<script lang="ts">
	import { browser } from '$app/env';
	import Room from '#lib/components/Room.svelte';
	import UsernameForm from '#lib/components/UsernameForm.svelte';
	import { identity } from '#lib/identity.svelte.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>Room {data.code} · Deadlock Pick/Ban</title>
</svelte:head>

{#if !browser}
	<p class="mt-10 text-center text-paper/50">Connecting…</p>
{:else if !identity.name}
	<div class="mx-auto mt-10 max-w-sm">
		<h1 class="heading mb-1 text-4xl leading-none">
			Join room <span class="font-mono tracking-widest">{data.code}</span>
		</h1>
		<p class="mb-4 text-sm text-paper/60">Choose a username to enter the lobby.</p>
		<UsernameForm label="Join room" />
	</div>
{:else}
	{#key data.code}
		<Room code={data.code} />
	{/key}
{/if}
