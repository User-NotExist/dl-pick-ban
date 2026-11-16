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

<!-- "Your turn" call-out: a team-coloured band crosses the screen when the turn passes to this player. -->
<div
	class="pointer-events-none fixed inset-0 z-[45] overflow-hidden"
	aria-hidden="true"
	style:--from={right ? '112%' : '-112%'}
>
	<div
		class="absolute top-1/2 left-[-8%] h-28 w-[116%] -translate-y-1/2 animate-cue sm:h-40"
		style:animation-delay="{startDelay}s"
	>
		<div
			class="absolute inset-0 -skew-x-12 border-y-4 border-ink shadow-2xl {right
				? 'bg-sapphire-team'
				: 'bg-amber-team'}"
		></div>
		<div class="relative flex h-full flex-col items-center justify-center px-[12%] text-center text-ink">
			<div class="font-display text-sm font-bold tracking-[0.35em] uppercase sm:text-lg">
				{eyebrow}
			</div>
			<div class="heading max-w-full truncate text-5xl leading-none sm:text-7xl">{title}</div>
		</div>
	</div>
</div>
