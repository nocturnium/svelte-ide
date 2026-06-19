<script module lang="ts">
	// Unique-per-instance counter (SSR-safe — no Math.random/Date) so the gradient
	// id is distinct when several marks render in one document (header + footer).
	let markCounter = 0;
</script>

<script lang="ts">
	/**
	 * Nocturnium Svelte IDE brand mark — an editor-window corner framing an aurora
	 * text caret (the cursor where code is written), with the spark of a thought
	 * becoming syntax. Transparent ground; meant to sit on the dark UI.
	 */
	interface Props {
		/** Rendered size in pixels (square). */
		size?: number;
		/** Extra class for layout. */
		class?: string;
	}

	let { size = 24, class: className = '' }: Props = $props();
	const gradId = `noct-caret-${++markCounter}`;
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
		<linearGradient id={gradId} x1="25" y1="17.5" x2="25" y2="39" gradientUnits="userSpaceOnUse">
			<stop offset="0" stop-color="#a78bfa" />
			<stop offset="1" stop-color="#4a8db7" />
		</linearGradient>
	</defs>
	<!-- editor-window top-left corner (segmented frame) -->
	<g stroke="#e8eefc" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
		<path d="M10 25 L10 13 a3 3 0 0 1 3 -3 L21 10" />
		<path d="M28 10 L38 10" />
		<path d="M10 29 L10 38" />
	</g>
	<!-- typing spark: a thought becoming syntax -->
	<g stroke="#e8eefc" stroke-width="2" stroke-linecap="round">
		<path d="M25 9.5 L25 12.5" />
		<path d="M20.4 11.3 L22.5 13.9" />
		<path d="M29.6 11.3 L27.5 13.9" />
	</g>
	<!-- caret / text cursor in aurora gradient -->
	<line
		x1="25"
		y1="18.5"
		x2="25"
		y2="38"
		stroke="url(#{gradId})"
		stroke-width="5"
		stroke-linecap="round"
	/>
</svg>

<style>
	svg {
		display: block;
		flex-shrink: 0;
	}
</style>
