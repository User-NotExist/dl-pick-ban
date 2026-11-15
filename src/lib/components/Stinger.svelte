<script lang="ts">
	let { title, delay = 0 }: { title: string; delay?: number } = $props();
</script>

<!-- Phase-change wipe: three slanted bars sweep across the screen and the phase title flashes up. -->
<div class="pointer-events-none fixed inset-0 z-50 overflow-hidden" aria-hidden="true">
	<div
		class="absolute inset-y-0 left-[-25%] w-[150%] animate-sweep bg-amber-team"
		style:animation-delay="{delay}s"
	></div>
	<div
		class="absolute inset-y-0 left-[-25%] w-[150%] animate-sweep bg-sapphire-team"
		style:animation-delay="{delay + 0.09}s"
	></div>
	<div
		class="absolute inset-y-0 left-[-25%] w-[150%] animate-sweep bg-ink"
		style:animation-delay="{delay + 0.18}s"
	></div>
	<div
		class="absolute inset-0 flex animate-title items-center justify-center px-4 text-center text-4xl font-display font-extrabold uppercase italic sm:text-7xl"
		style:animation-delay="{delay + 0.18}s"
	>
		{title}
	</div>
</div>
