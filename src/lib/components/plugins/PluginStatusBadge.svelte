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

<style>
	/* Opaque tinted fill + a lightened text colour, so the badge text stays above 4.5:1
	   whatever the status hue is. A translucent fill would let the page behind it change the ratio. */
	.ide-plugin-status {
		--status-hue: var(--ide-plugin-draft);
		background-color: color-mix(in srgb, var(--status-hue) 22%, var(--ide-bg-primary));
		color: color-mix(in srgb, var(--status-hue) 45%, white);
	}
	.ide-plugin-status--draft {
		--status-hue: var(--ide-plugin-draft);
	}
	.ide-plugin-status--submitted {
		--status-hue: var(--ide-plugin-submitted);
	}
	.ide-plugin-status--reviewing {
		--status-hue: var(--ide-plugin-reviewing);
	}
	.ide-plugin-status--approved {
		--status-hue: var(--ide-plugin-approved);
	}
	.ide-plugin-status--testing {
		--status-hue: var(--ide-plugin-testing);
	}
	.ide-plugin-status--rejected {
		--status-hue: var(--ide-plugin-rejected);
	}
	.ide-plugin-status--deploying {
		--status-hue: var(--ide-plugin-deploying);
	}
	.ide-plugin-status--deployed {
		--status-hue: var(--ide-plugin-deployed);
	}
	.ide-plugin-status--rolled_back {
		--status-hue: var(--ide-plugin-rolled_back);
	}
</style>
