<script lang="ts">
	import { browser } from '$app/env';
	import Stream from '#lib/components/Stream.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>Stream · Deadlock Pick/Ban</title>
</svelte:head>

{#if browser}
	{#key data.code}
		<Stream code={data.code} streamKey={data.key} />
	{/key}
{/if}
