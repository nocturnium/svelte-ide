/**
 * Dialog focus management.
 *
 * `focusTrap` is a Svelte action for modal dialogs. When the node mounts it
 * moves focus to the first control (or the element matching `initialFocus`),
 * keeps Tab / Shift+Tab inside the node, pulls focus back if something outside
 * receives it, and returns focus to the element that opened the dialog when the
 * node is destroyed. While the node is mounted everything outside it is made
 * `inert`, so assistive technology and pointer events cannot reach the page behind
 * a modal dialog (the node's own ancestors, such as <main>, stay live).
 *
 * Escape handling stays with the dialog, because each dialog decides what
 * "cancel" means.
 */

export interface FocusTrapOptions {
	/** CSS selector (relative to the node) for the element that should receive focus first. */
	initialFocus?: string;
	/** Return focus to the previously focused element on destroy. Defaults to true. */
	restoreFocus?: boolean;
}

/** Elements a user can reach with the Tab key. */
export const FOCUSABLE_SELECTOR = [
	'a[href]',
	'area[href]',
	'button:not([disabled])',
	'input:not([disabled]):not([type="hidden"])',
	'select:not([disabled])',
	'textarea:not([disabled])',
	'iframe',
	'summary',
	'[contenteditable=""]',
	'[contenteditable="true"]',
	'[tabindex]:not([tabindex^="-"])'
].join(',');

function isRendered(el: HTMLElement): boolean {
	if (el.hasAttribute('hidden')) return false;
	// Elements with display:none (or inside such a parent) have no layout boxes.
	return typeof el.getClientRects !== 'function' || el.getClientRects().length > 0;
}

/** Tabbable descendants of `root`, in DOM order, skipping disabled and hidden ones. */
export function getFocusable(root: ParentNode): HTMLElement[] {
	return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((el) => {
		const tabindex = el.getAttribute('tabindex');
		if (tabindex !== null && Number(tabindex) < 0) return false;
		return isRendered(el);
	});
}

/**
 * Element that should receive focus when Tab (or Shift+Tab) is pressed with
 * `active` focused, or null when the browser's default move stays inside the
 * dialog. Only wraps at the ends, so normal tabbing is left to the browser.
 */
export function nextTrapTarget<T>(focusable: T[], active: unknown, shift: boolean): T | null {
	if (focusable.length === 0) return null;
	const first = focusable[0];
	const last = focusable[focusable.length - 1];
	const index = focusable.indexOf(active as T);
	if (index === -1) return shift ? last : first;
	if (shift && active === first) return last;
	if (!shift && active === last) return first;
	return null;
}

export function focusTrap(node: HTMLElement, options: FocusTrapOptions = {}) {
	const doc = node.ownerDocument;
	const opener = doc.activeElement instanceof HTMLElement ? doc.activeElement : null;
	let current = options;

	// Make the rest of the page inert: walk from the dialog up to <body> and mark each
	// ancestor's other children. Elements that were already inert are left alone, so
	// nested dialogs unwind in the right order.
	const madeInert: HTMLElement[] = [];
	for (let el: HTMLElement | null = node; el && el.parentElement; el = el.parentElement) {
		for (const sibling of Array.from(el.parentElement.children) as HTMLElement[]) {
			if (sibling === el || sibling.hasAttribute('inert')) continue;
			const tag = sibling.tagName;
			if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'LINK' || tag === 'TEMPLATE') continue;
			sibling.setAttribute('inert', '');
			madeInert.push(sibling);
		}
	}

	// A dialog with no tabbable content still has to hold focus (and be announced).
	if (!node.hasAttribute('tabindex')) node.setAttribute('tabindex', '-1');

	const initial = current.initialFocus
		? node.querySelector<HTMLElement>(current.initialFocus)
		: null;
	(initial ?? getFocusable(node)[0] ?? node).focus();

	function onKeydown(event: KeyboardEvent) {
		if (event.key !== 'Tab' || event.defaultPrevented) return;
		const focusable = getFocusable(node);
		if (focusable.length === 0) {
			event.preventDefault();
			node.focus();
			return;
		}
		const target = nextTrapTarget(focusable, doc.activeElement, event.shiftKey);
		if (target) {
			event.preventDefault();
			target.focus();
		}
	}

	function onFocusIn(event: FocusEvent) {
		const target = event.target as Node | null;
		if (target && !node.contains(target)) {
			(getFocusable(node)[0] ?? node).focus();
		}
	}

	node.addEventListener('keydown', onKeydown);
	doc.addEventListener('focusin', onFocusIn);

	return {
		update(next: FocusTrapOptions = {}) {
			current = next;
		},
		destroy() {
			node.removeEventListener('keydown', onKeydown);
			doc.removeEventListener('focusin', onFocusIn);
			for (const el of madeInert) el.removeAttribute('inert');
			if (current.restoreFocus !== false && opener && opener.isConnected) opener.focus();
		}
	};
}
