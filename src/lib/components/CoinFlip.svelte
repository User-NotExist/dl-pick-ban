<script lang="ts">
	import { PATRON_ICON } from '#lib/patrons.ts';
	import { FLIP_REVEAL_DELAY_S, TEAM_NAMES, type Team } from '#lib/types.ts';

	let { winner }: { winner: Team } = $props();

	// everything waits for the last ban's reveal band to clear
	const start = FLIP_REVEAL_DELAY_S;
	const landed = start + 2.9;
	const teamColor = $derived(
		winner === 'A' ? 'var(--color-amber-team)' : 'var(--color-sapphire-team)'
	);
</script>

<!--
	Coin flip for first pick. The coin has a patron on each face; it always makes whole turns
	and ends on the winner's face (an extra half turn for the Archmother, who is on the back).
	With reduced motion the stage is shown without animating, already on the result.
-->
<div
	class="pointer-events-none fixed inset-0 z-40 flex animate-coin-stage flex-col items-center justify-center gap-6 overflow-hidden bg-ink/90 motion-reduce:[animation:none]"
	style:animation-delay="{start}s"
	role="status"
>
	<div class="font-display text-xl font-semibold tracking-[0.4em] text-paper/70 uppercase">
		Coin flip · First pick
	</div>

	<div class="[perspective:900px]">
		<div class="animate-coin-toss" style:animation-delay="{start}s">
			<div
				class="relative size-44 animate-coin-spin [transform-style:preserve-3d] sm:size-60"
				style:animation-delay="{start}s"
				style:--coin-end={winner === 'A' ? '1800deg' : '1980deg'}
			>
				<div
					class="absolute inset-0 flex items-center justify-center rounded-full border-8 border-double border-[#b97a00] bg-amber-team shadow-[inset_0_0_30px_rgb(0_0_0/0.35)] [backface-visibility:hidden]"
				>
					<img src={PATRON_ICON.A} alt="" class="size-[78%] object-contain" />
				</div>
				<div
					class="absolute inset-0 flex [transform:rotateY(180deg)] items-center justify-center rounded-full border-8 border-double border-[#234d78] bg-[#3874ae] shadow-[inset_0_0_30px_rgb(0_0_0/0.35)] [backface-visibility:hidden]"
				>
					<img src={PATRON_ICON.B} alt="" class="size-[78%] object-contain" />
				</div>
			</div>
		</div>
	</div>

	<div class="flex flex-col items-center gap-2 px-4 text-center">
		<div
			class="heading animate-pop text-4xl leading-tight sm:text-6xl"
			style:color={teamColor}
			style:animation-delay="{landed}s"
		>
			{TEAM_NAMES[winner]}
		</div>
		<div
			class="tag animate-slide px-5 py-0.5 text-xl tracking-[0.2em] sm:text-2xl"
			style:background-color={teamColor}
			style:animation-delay="{landed + 0.15}s"
		>
			Picks first
		</div>
	</div>
</div>
