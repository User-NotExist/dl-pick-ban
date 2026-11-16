<script lang="ts">
	import './layout.css';
	import favicon from '#lib/assets/dedlok.png';
	import logo from '#lib/assets/deadlock.png';
	import { page } from '$app/state';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	/** the stream page is a bare full-screen stage: no site header, no page column */
	const bare = $derived(!!page.route.id?.endsWith('/stream') && !page.error);
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>Deadlock Pick/Ban</title>
</svelte:head>

{#if bare}
	{@render children()}
{:else}
	<header class="relative border-b border-brass/30 bg-ink/80 px-4 py-2.5 backdrop-blur">
		<a href="/" class="mx-auto flex max-w-[1500px] items-center gap-3">
			<img src={logo} alt="" class="h-8 w-auto" />
			<span class="heading text-xl leading-none">Pick <span class="text-brass">/</span> Ban</span>
		</a>
		<div
			class="absolute inset-x-0 -bottom-px h-px bg-gradient-to-r from-amber-team via-transparent to-sapphire-team"
		></div>
	</header>

	<main class="mx-auto max-w-[1500px] px-3 py-5 sm:px-4">
		{@render children()}
	</main>
{/if}
