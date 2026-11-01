/**
 * Shared viewport placement for floating LSP widgets (completions, hover,
 * signature help). Pure geometry plus a small Svelte action that applies it.
 */

export interface Point {
	x: number;
	y: number;
}

export interface Size {
	width: number;
	height: number;
}

export interface PlacementOptions {
	/** Gap kept between the widget and every viewport edge (default 8). */
	margin?: number;
	/**
	 * Height of the line the anchor sits on. Anchor y is the bottom of that line;
	 * when the widget flips above, it clears the whole line (default 20).
	 */
	anchorHeight?: number;
}

export interface Placement extends Point {
	placement: 'below' | 'above';
}

/**
 * Place a widget of `size` next to `anchor` so it stays inside `viewport`.
 * It opens below the anchor, flips above when below is too short and above has
 * more room, and shifts horizontally so neither edge is clipped.
 */
export function computePlacement(
	anchor: Point,
	size: Size,
	viewport: Size,
	options: PlacementOptions = {}
): Placement {
	const margin = options.margin ?? 8;
	const anchorHeight = options.anchorHeight ?? 20;

	const width = Math.min(size.width, Math.max(0, viewport.width - margin * 2));
	const maxX = Math.max(margin, viewport.width - margin - width);
	const x = Math.min(Math.max(anchor.x, margin), maxX);

	const spaceBelow = viewport.height - margin - anchor.y;
	const spaceAbove = anchor.y - anchorHeight - margin;

	const fitsBelow = size.height <= spaceBelow;
	const fitsAbove = size.height <= spaceAbove;
	const above = !fitsBelow && (fitsAbove || spaceAbove > spaceBelow);

	let y = above ? anchor.y - anchorHeight - size.height : anchor.y;
	y = Math.min(y, viewport.height - margin - size.height);
	y = Math.max(y, margin);

	return { x, y, placement: above ? 'above' : 'below' };
}

export type PlacementParams = Point & PlacementOptions;

/**
 * Svelte action: keeps a `position: fixed` element inside the viewport. It owns
 * the element's left and top, re-measures when the element resizes (for example
 * when a docs pane appears), and re-places on window resize.
 */
export function placeInViewport(node: HTMLElement, params: PlacementParams) {
	let current = params;

	function apply() {
		// Measure at the origin: a fixed element's shrink-to-fit width depends on left.
		node.style.left = '0px';
		node.style.top = '0px';
		const rect = node.getBoundingClientRect();
		const result = computePlacement(
			{ x: current.x, y: current.y },
			{ width: rect.width, height: rect.height },
			{ width: window.innerWidth, height: window.innerHeight },
			current
		);
		node.style.left = `${result.x}px`;
		node.style.top = `${result.y}px`;
		node.dataset.placement = result.placement;
	}

	apply();

	const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(apply) : null;
	observer?.observe(node);
	window.addEventListener('resize', apply);

	return {
		update(next: PlacementParams) {
			current = next;
			apply();
		},
		destroy() {
			observer?.disconnect();
			window.removeEventListener('resize', apply);
		}
	};
}
