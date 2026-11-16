<script lang="ts">
	import type { Team } from '#lib/types.ts';

	let {
		team,
		title,
		eyebrow,
		delay = 0
	}: { team: Team; title: string; eyebrow: string; delay?: number } = $props();

	// fixed at mount: a later change would restart the animation mid-flight
	// svelte-ignore state_referenced_locally
	const startDelay = delay;
	const right = $derived(team === 'B');
</script>

<!-- "Your turn" call-out: a title band ruled in the team's colour crosses the screen when the turn passes to this player. -->
<div
	class="pointer-events-none fixed inset-0 z-[45] overflow-hidden"
	aria-hidden="true"
	style:--from={right ? '112%' : '-112%'}
>
	<div
		class="absolute top-1/2 left-0 h-28 w-full -translate-y-1/2 animate-cue sm:h-40"
		style:animation-delay="{startDelay}s"
	>
		<div
			class="absolute inset-0 border-y-2 bg-ink/95 shadow-2xl {right
				? 'border-sapphire-team'
				: 'border-amber-team'}"
		>
			<div
				class="absolute inset-x-0 inset-y-1.5 border-y opacity-50 {right
					? 'border-sapphire-team'
					: 'border-amber-team'}"
			></div>
		</div>
		<div class="relative flex h-full flex-col items-center justify-center gap-1 px-6 text-center">
			<div class="font-display text-sm font-bold tracking-[0.35em] text-paper/70 uppercase sm:text-lg">
				{eyebrow}
			</div>
			<div
				class="heading max-w-full truncate text-3xl leading-tight sm:text-6xl {right
					? 'text-sapphire-team'
					: 'text-amber-team'}"
			>
				{title}
			</div>
		</div>
	</div>
</div>
