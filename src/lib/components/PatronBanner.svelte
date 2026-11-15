<script lang="ts">
	import { PATRON_ART } from '#lib/patrons.ts';
	import { TEAM_NAMES, type Team } from '#lib/types.ts';

	let { team, class: className = '' }: { team: Team; class?: string } = $props();
</script>

<!-- The name is part of the artwork, so this heading replaces the text team name. -->
<h2 class="overflow-hidden {className}">
	<img
		src={PATRON_ART[team]}
		alt={TEAM_NAMES[team]}
		width="1280"
		height="960"
		class="h-full w-full object-cover object-[50%_43%]"
	/>
</h2>
