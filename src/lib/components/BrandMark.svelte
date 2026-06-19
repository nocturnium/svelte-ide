<script module lang="ts">
	// Unique-per-instance counter (SSR-safe — no Math.random/Date) so the gradient
	// and clip ids stay distinct when several marks render in one document.
	let markCounter = 0;
</script>

<script lang="ts">
	/**
	 * Nocturnium Svelte IDE brand mark — a minimal vial holding a glowing blue→purple
	 * "Nocturnium" reagent (the -ium element synthesized in the dark). Light outline +
	 * coordinated aurora liquid; transparent ground, meant to sit on the dark UI.
	 */
	interface Props {
		/** Rendered size in pixels (square). */
		size?: number;
		/** Extra class for layout. */
		class?: string;
	}

	let { size = 24, class: className = '' }: Props = $props();
	const n = ++markCounter;
	const gradId = `noct-vial-grad-${n}`;
	const clipId = `noct-vial-clip-${n}`;
	const body =
		'M21 9 L21 15 C21 17 16 18 16 23 L16 37 Q16 41 20 41 L28 41 Q32 41 32 37 L32 23 C32 18 27 17 27 15 L27 9 Z';
</script>

<svg
	class={className}
	width={size}
	height={size}
	viewBox="0 0 48 48"
	fill="none"
	role="img"
	aria-hidden="true"
	xmlns="http://www.w3.org/2000/svg"
>
	<defs>
		<linearGradient id={gradId} x1="16" y1="24" x2="32" y2="24" gradientUnits="userSpaceOnUse">
			<stop offset="0" stop-color="#4a8db7" />
			<stop offset="1" stop-color="#a78bfa" />
		</linearGradient>
		<clipPath id={clipId}><path d={body} /></clipPath>
	</defs>
	<!-- aurora reagent, clipped to the vial interior -->
	<rect x="14" y="25.5" width="20" height="17" fill="url(#{gradId})" clip-path="url(#{clipId})" />
	<!-- vial outline -->
	<path d={body} fill="none" stroke="#e8eefc" stroke-width="2.4" stroke-linejoin="round" />
	<!-- lip -->
	<rect x="19.5" y="5.6" width="9" height="3.8" rx="1.9" fill="#e8eefc" />
</svg>

<style>
	svg {
		display: block;
		flex-shrink: 0;
	}
</style>
