<script lang="ts">
	import { goto } from '$app/navigation';
	import { identity } from '#lib/identity.svelte.ts';

	let name = $state(identity.name);
	let code = $state('');
	let busy = $state(false);
	let error = $state('');

	const ready = $derived(name.trim().length > 0);

	async function create() {
		if (!ready || busy) return;
		busy = true;
		error = '';
		identity.setName(name);
		try {
			// sent as JSON so it is not treated as a form submission (which requires a matching ORIGIN)
			const res = await fetch('/api/room', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: '{}'
			});
			if (!res.ok) throw new Error();
			const body = await res.json();
			await goto(`/room/${body.code}`);
		} catch {
			error = 'Could not create a room. Try again.';
		} finally {
			busy = false;
		}
	}

	async function joinRoom(e: SubmitEvent) {
		e.preventDefault();
		const c = code.trim().toUpperCase();
		if (!ready || !c) return;
		identity.setName(name);
		await goto(`/room/${c}`);
	}
</script>

<div class="mx-auto mt-10 flex max-w-sm flex-col gap-6">
	<div>
		<h1 class="heading text-4xl leading-tight">Draft lobby</h1>
		<div class="divider mt-1"><span class="size-1.5 rotate-45 bg-brass"></span></div>
		<p class="mt-2 text-sm text-paper/60">
			Form two teams of up to 6, ban two heroes each, then take turns picking.
		</p>
	</div>

	<label class="flex flex-col gap-1 text-sm">
		<span class="text-paper/70">Username</span>
		<input
			bind:value={name}
			maxlength="20"
			autocomplete="nickname"
			placeholder="Your name"
			class="border border-brass/40 bg-panel px-3 py-2 text-base outline-none focus:border-paper"
		/>
	</label>

	<button
		onclick={create}
		disabled={!ready || busy}
		class="btn btn-primary py-2.5 text-xl"
	>
		Create room
	</button>

	<div class="flex items-center gap-3 text-xs text-paper/40">
		<span class="h-px flex-1 bg-brass/40"></span>or join one<span class="h-px flex-1 bg-brass/40"></span>
	</div>

	<form onsubmit={joinRoom} class="flex gap-2">
		<input
			bind:value={code}
			maxlength="5"
			placeholder="Room code"
			aria-label="Room code"
			class="min-w-0 flex-1 border border-brass/40 bg-panel px-3 py-2 font-mono tracking-widest uppercase outline-none focus:border-paper/60"
		/>
		<button
			disabled={!ready || !code.trim()}
			class="btn btn-ghost"
		>
			Join
		</button>
	</form>

	{#if error}<p class="text-sm text-red-400">{error}</p>{/if}
</div>
