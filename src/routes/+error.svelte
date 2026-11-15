<script lang="ts">
	import { page } from '$app/state';
</script>

<div class="mx-auto mt-10 max-w-sm text-center">
	<h1 class="text-xl font-bold">{page.error?.message ?? 'Something went wrong'}</h1>
	<a href="/" class="mt-4 inline-block underline">Back to start</a>
</div>
