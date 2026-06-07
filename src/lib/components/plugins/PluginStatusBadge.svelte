<script lang="ts">
	import type { PluginStatus } from '$types';

	interface Props {
		status: PluginStatus;
		class?: string;
	}

	let { status, class: className = '' }: Props = $props();
</script>

<span class="ide-plugin-status ide-plugin-status--{status} {className}">
	{status.replace('_', ' ')}
</span>
