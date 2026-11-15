<script lang="ts">
	import { identity } from '#lib/identity.svelte.ts';

	let { label = 'Continue', onsubmit }: { label?: string; onsubmit?: () => void } = $props();

	let name = $state(identity.name);

	function submit(e: SubmitEvent) {
		e.preventDefault();
		if (!name.trim()) return;
		identity.setName(name);
		onsubmit?.();
	}
</script>

<form onsubmit={submit} class="flex flex-col gap-3">
	<label class="flex flex-col gap-1 text-sm">
		<span class="text-paper/70">Username</span>
		<input
			bind:value={name}
			maxlength="20"
			required
			autocomplete="nickname"
			placeholder="Your name"
			class="rounded border border-line bg-ink px-3 py-2 text-base outline-none focus:border-paper/60"
		/>
	</label>
	<button
		class="btn btn-primary"
		disabled={!name.trim()}
	>
		{label}
	</button>
</form>
