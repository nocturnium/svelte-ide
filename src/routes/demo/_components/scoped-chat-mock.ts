import { browser } from '$app/environment';
import { streamMockResponse } from '$lib/services/mock-ai';

/**
 * Scoped, idempotent static-host chat mock — shared by every demo route that
 * embeds an <AIPanel>.
 *
 * On GitHub Pages there is no backend, so the AI store's `/api/chat` fetch
 * (fired when a user sends a message in the embedded <AIPanel>) would fail and
 * surface a red error band. The store performs a raw `fetch(endpoint)` with no
 * injection hook, so the only way to keep the demo alive without a backend is
 * to intercept that one request — but *scoped*, not by mutating the global.
 *
 * We **short-circuit** rather than fall back after a failed response: a matching
 * request returns the canned streamed Response directly and never awaits the real
 * fetch. That keeps the mock independent of whatever the host does with a path it
 * cannot route. GitHub Pages currently answers `POST /api/chat` with 405 and
 * `GET` with a 404 HTML shell (verified against ide.nocturnium.ai), but a host
 * that served a 200 shell instead would stream HTML into <AIPanel> — so relying
 * on `res.ok` would be wrong on some hosts, and short-circuiting is right on all
 * of them.
 *
 * This lives under `src/routes/` — NOT `src/lib/` — on purpose: it is demo
 * scaffolding for a static host, not library surface. Consumers of the package
 * wire a real endpoint (or their own transport) instead.
 *
 * Lifecycle hardening:
 *  - gated by a module-level sentinel (`chatMockRefCount`) so repeated SPA
 *    re-mounts, and two routes overlapping during a navigation, do not stack
 *    wrappers,
 *  - torn down via the returned restore() from each page's `onDestroy`, which
 *    fires on SPA navigation away (no leak across routes), and
 *  - teardown is identity-guarded: we only restore the saved global if it is
 *    still the wrapper this scope installed (don't clobber a newer overlay).
 */
let chatMockRefCount = 0;
let savedChatFetch: typeof globalThis.fetch | null = null;
let installedChatFetch: typeof globalThis.fetch | null = null;

/** Build a streamed canned-response Response for a /api/chat request body. */
function cannedChatResponse(body: unknown): Response {
	let prompt = 'Explain this code';
	try {
		const parsed = JSON.parse(String(body ?? '{}')) as {
			messages?: Array<{ role: string; content: string }>;
		};
		const lastUser = [...(parsed.messages ?? [])].reverse().find((m) => m.role === 'user');
		if (lastUser?.content) prompt = lastUser.content;
	} catch {
		/* use default prompt */
	}

	const stream = new ReadableStream<Uint8Array>({
		async start(controller) {
			const encoder = new TextEncoder();
			try {
				for await (const chunk of streamMockResponse(prompt, {
					responseDelay: 200,
					streamingDelay: 18
				})) {
					controller.enqueue(encoder.encode(chunk));
				}
			} finally {
				controller.close();
			}
		}
	});

	return new Response(stream, {
		status: 200,
		headers: { 'Content-Type': 'text/plain; charset=utf-8' }
	});
}

/**
 * Does this request target *our* chat endpoint?
 *
 * Deliberately an exact same-origin pathname match, not a substring test: a
 * `.includes('/api/chat')` would also swallow `https://example.com/api/chat` and
 * `/api/chatrooms`, fabricating a 200 for a request that was never ours. Nothing
 * else on the demo site fetches such a URL today, but a mock that answers for
 * other people's endpoints is a trap for whoever adds one.
 */
function isChatRequest(input: RequestInfo | URL): boolean {
	const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
	try {
		const url = new URL(raw, globalThis.location.href);
		return url.origin === globalThis.location.origin && url.pathname === '/api/chat';
	} catch {
		return false;
	}
}

/**
 * Install the scoped /api/chat fallback. Idempotent: only the first caller
 * wraps `fetch`; the returned restore() removes the wrapper once the last
 * scope releases it. Returns a no-op restore on the server.
 *
 * Call it synchronously during component setup and pass the result to
 * `onDestroy`, so the wrapper is live before the panel can send anything and is
 * removed when the route unmounts.
 */
export function installScopedChatMock(): () => void {
	if (!browser) return () => {};

	if (chatMockRefCount === 0) {
		const baseFetch = globalThis.fetch.bind(globalThis);
		savedChatFetch = globalThis.fetch;

		const wrappedFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
			if (isChatRequest(input)) {
				// Short-circuit: no real backend on a static host, and a 200 here is
				// the SPA HTML fallback, not a stream — so never await the real
				// fetch. Return the canned streamed Response directly.
				return cannedChatResponse(init?.body);
			}
			return baseFetch(input, init);
		};

		installedChatFetch = wrappedFetch;
		globalThis.fetch = wrappedFetch;
	}

	chatMockRefCount += 1;
	let released = false;
	return () => {
		if (released) return;
		released = true;
		chatMockRefCount -= 1;
		if (chatMockRefCount === 0) {
			// Identity-guarded restore: only reset fetch if it is still the wrapper
			// this scope installed (don't clobber a newer overlay).
			if (savedChatFetch && globalThis.fetch === installedChatFetch) {
				globalThis.fetch = savedChatFetch;
			}
			savedChatFetch = null;
			installedChatFetch = null;
		}
	};
}
