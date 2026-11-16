<script lang="ts">
	let { title, delay = 0 }: { title: string; delay?: number } = $props();
</script>

<!--
	Phase-change wipe: two curtain halves close from the sides, each edged in its team's colour,
	and the phase title is shown on them as a title card before they open again.
-->
<div class="pointer-events-none fixed inset-0 z-50 overflow-hidden" aria-hidden="true">
	<div
		class="absolute inset-y-0 left-0 w-1/2 animate-curtain border-r-2 border-amber-team bg-ink shadow-[inset_-40px_0_60px_-30px_rgb(0_0_0/0.8)]"
		style:--from="-101%"
		style:animation-delay="{delay}s"
	></div>
	<div
		class="absolute inset-y-0 right-0 w-1/2 animate-curtain border-l-2 border-sapphire-team bg-ink shadow-[inset_40px_0_60px_-30px_rgb(0_0_0/0.8)]"
		style:--from="101%"
		style:animation-delay="{delay}s"
	></div>
	<div
		class="absolute inset-0 flex animate-title flex-col items-center justify-center gap-3 px-4 text-center"
		style:animation-delay="{delay + 0.1}s"
	>
		<div class="divider w-64 max-w-full sm:w-96"><span class="size-2 rotate-45 bg-brass"></span></div>
		<div class="heading text-3xl leading-tight sm:text-6xl">{title}</div>
		<div class="divider w-64 max-w-full sm:w-96"><span class="size-2 rotate-45 bg-brass"></span></div>
	</div>
</div>
