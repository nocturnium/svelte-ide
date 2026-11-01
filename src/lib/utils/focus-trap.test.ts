import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FOCUSABLE_SELECTOR, focusTrap, getFocusable, nextTrapTarget } from './focus-trap';

// The test environment is Node, so the DOM is replaced by the few members the helper touches.
class FakeElement {
	focused = false;
	isConnected = true;
	ownerDocument: FakeElement | null = null;
	parentElement: FakeElement | null = null;
	tagName = 'DIV';
	private attrs = new Map<string, string>();
	private listeners = new Map<string, Set<(e: never) => void>>();
	children: FakeElement[] = [];
	constructor(
		public name: string,
		attrs: Record<string, string> = {},
		private rendered = true
	) {
		for (const [k, v] of Object.entries(attrs)) this.attrs.set(k, v);
	}
	hasAttribute(k: string) {
		return this.attrs.has(k);
	}
	getAttribute(k: string) {
		return this.attrs.get(k) ?? null;
	}
	setAttribute(k: string, v: string) {
		this.attrs.set(k, v);
	}
	removeAttribute(k: string) {
		this.attrs.delete(k);
	}
	getClientRects() {
		return this.rendered ? [{}] : [];
	}
	querySelectorAll(selector: string) {
		return selector === FOCUSABLE_SELECTOR ? this.children : [];
	}
	querySelector(selector: string) {
		return this.children.find((c) => c.name === selector.replace('#', '')) ?? null;
	}
	contains(other: unknown) {
		return other === this || this.children.includes(other as FakeElement);
	}
	addEventListener(type: string, fn: (e: never) => void) {
		if (!this.listeners.has(type)) this.listeners.set(type, new Set());
		this.listeners.get(type)!.add(fn);
	}
	removeEventListener(type: string, fn: (e: never) => void) {
		this.listeners.get(type)?.delete(fn);
	}
	dispatch(type: string, event: object) {
		for (const fn of this.listeners.get(type) ?? []) fn(event as never);
	}
	listenerCount() {
		return [...this.listeners.values()].reduce((n, s) => n + s.size, 0);
	}
	focus() {
		doc.activeElement = this;
		this.focused = true;
	}
}

class FakeDocument extends FakeElement {
	activeElement: FakeElement | null = null;
}
const doc = new FakeDocument('document');

function setup() {
	const opener = new FakeElement('opener');
	const close = new FakeElement('close');
	const first = new FakeElement('first');
	const last = new FakeElement('last');
	const dialog = new FakeElement('dialog');
	dialog.children = [close, first, last];
	dialog.ownerDocument = doc;
	doc.activeElement = opener;
	return { opener, close, first, last, dialog };
}

function tab(shiftKey = false) {
	let prevented = false;
	return {
		event: {
			key: 'Tab',
			shiftKey,
			defaultPrevented: false,
			preventDefault: () => (prevented = true)
		},
		wasPrevented: () => prevented
	};
}

beforeEach(() => {
	(globalThis as Record<string, unknown>).HTMLElement = FakeElement;
});
afterEach(() => {
	delete (globalThis as Record<string, unknown>).HTMLElement;
});

describe('nextTrapTarget', () => {
	const items = ['a', 'b', 'c'];

	it('leaves tabbing inside the dialog to the browser', () => {
		expect(nextTrapTarget(items, 'a', false)).toBeNull();
		expect(nextTrapTarget(items, 'b', true)).toBeNull();
	});

	it('wraps from last to first and first to last', () => {
		expect(nextTrapTarget(items, 'c', false)).toBe('a');
		expect(nextTrapTarget(items, 'a', true)).toBe('c');
	});

	it('pulls focus in when it is outside the dialog', () => {
		expect(nextTrapTarget(items, 'outside', false)).toBe('a');
		expect(nextTrapTarget(items, 'outside', true)).toBe('c');
	});

	it('has nothing to target without focusable elements', () => {
		expect(nextTrapTarget([], null, false)).toBeNull();
	});
});

describe('getFocusable', () => {
	it('skips elements with tabindex -1, hidden attribute or no layout box', () => {
		const root = new FakeElement('root');
		root.children = [
			new FakeElement('ok'),
			new FakeElement('neg', { tabindex: '-1' }),
			new FakeElement('hidden', { hidden: '' }),
			new FakeElement('collapsed', {}, false)
		];
		expect(
			getFocusable(root as unknown as ParentNode).map((e) => (e as unknown as FakeElement).name)
		).toEqual(['ok']);
	});
});

describe('focusTrap', () => {
	it('focuses the first control on mount', () => {
		const { dialog, close } = setup();
		focusTrap(dialog as unknown as HTMLElement);
		expect(doc.activeElement).toBe(close);
	});

	it('honours initialFocus', () => {
		const { dialog, first } = setup();
		focusTrap(dialog as unknown as HTMLElement, { initialFocus: '#first' });
		expect(doc.activeElement).toBe(first);
	});

	it('falls back to the dialog itself when it has no controls', () => {
		const { dialog } = setup();
		dialog.children = [];
		focusTrap(dialog as unknown as HTMLElement);
		expect(doc.activeElement).toBe(dialog);
		expect(dialog.getAttribute('tabindex')).toBe('-1');
	});

	it('wraps Tab on the last control and Shift+Tab on the first', () => {
		const { dialog, close, last } = setup();
		focusTrap(dialog as unknown as HTMLElement);

		last.focus();
		const forward = tab();
		dialog.dispatch('keydown', forward.event);
		expect(forward.wasPrevented()).toBe(true);
		expect(doc.activeElement).toBe(close);

		const backward = tab(true);
		dialog.dispatch('keydown', backward.event);
		expect(backward.wasPrevented()).toBe(true);
		expect(doc.activeElement).toBe(last);
	});

	it('does not interfere with Tab between inner controls', () => {
		const { dialog, first } = setup();
		focusTrap(dialog as unknown as HTMLElement);
		first.focus();
		const t = tab();
		dialog.dispatch('keydown', t.event);
		expect(t.wasPrevented()).toBe(false);
	});

	it('restores focus to the opener on destroy and removes its listeners', () => {
		const { dialog, opener } = setup();
		const action = focusTrap(dialog as unknown as HTMLElement);
		expect(doc.activeElement).not.toBe(opener);
		action.destroy();
		expect(doc.activeElement).toBe(opener);
		expect(dialog.listenerCount()).toBe(0);
	});

	it('skips restoring focus when disabled or when the opener left the page', () => {
		const a = setup();
		focusTrap(a.dialog as unknown as HTMLElement, { restoreFocus: false }).destroy();
		expect(doc.activeElement).not.toBe(a.opener);

		const b = setup();
		const action = focusTrap(b.dialog as unknown as HTMLElement);
		b.opener.isConnected = false;
		action.destroy();
		expect(b.opener.focused).toBe(false);
	});

	it('makes everything outside the dialog inert, keeps its ancestors live, and undoes it on destroy', () => {
		const { dialog } = setup();
		const body = new FakeElement('body');
		const header = new FakeElement('header');
		const main = new FakeElement('main');
		const sibling = new FakeElement('sibling');
		const script = new FakeElement('script');
		script.tagName = 'SCRIPT';
		const alreadyInert = new FakeElement('already', { inert: '' });
		body.children = [header, main, script];
		main.children = [sibling, alreadyInert, dialog];
		main.parentElement = body;
		dialog.parentElement = main;
		header.parentElement = sibling.parentElement = alreadyInert.parentElement = null;

		const action = focusTrap(dialog as unknown as HTMLElement);
		expect(header.hasAttribute('inert')).toBe(true);
		expect(sibling.hasAttribute('inert')).toBe(true);
		expect(main.hasAttribute('inert')).toBe(false);
		expect(dialog.hasAttribute('inert')).toBe(false);
		expect(script.hasAttribute('inert')).toBe(false);

		action.destroy();
		expect(header.hasAttribute('inert')).toBe(false);
		expect(sibling.hasAttribute('inert')).toBe(false);
		// It was inert before the dialog opened, so closing the dialog must not touch it
		expect(alreadyInert.hasAttribute('inert')).toBe(true);
	});
});
