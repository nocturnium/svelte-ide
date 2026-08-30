/**
 * Combinators for {@link ComplexityProvider}s.
 *
 * A real deployment rarely wants one provider. It wants a parser where a parser
 * exists, something slower behind it for the languages the parser does not
 * cover, and the built-in token scanner underneath all of it — with a bound on
 * how long any of that is allowed to take.
 *
 * These are the pieces for that, and they are deliberately plain functions over
 * the provider type rather than configuration on the editor: composing them is
 * how you say what you want, and nothing here needs to know the order you chose.
 *
 * There is no retry combinator, on purpose. Measured against the local proxy,
 * one model averaged 44.7 seconds per request; retrying that turns a slow
 * refinement into a stuck one, and the editor already re-asks on the next
 * keystroke with a fresh abort. Timeouts, not retries, are the right bound here.
 */

import type { ComplexityProvider, ComplexityProviderRequest } from './complexity-provider';

/**
 * Try providers in order; the first that returns a result wins.
 *
 * A provider that declines (returns null) or throws is skipped and the next is
 * tried, so a failing network provider cannot mask a working local one. If every
 * provider declines, the composed provider declines, and the editor keeps the
 * built-in reading.
 *
 * @example a parser first, a model only for what it cannot parse
 * ```ts
 * const provider = composeComplexityProviders(
 *   createAstComplexityProvider({ parse, adapter }),
 *   createOllamaComplexityProvider({ model: 'qwen2.5-coder' })
 * );
 * ```
 */
export function composeComplexityProviders(
	...providers: Array<ComplexityProvider | null | undefined>
): ComplexityProvider {
	const chain = providers.filter((p): p is ComplexityProvider => typeof p === 'function');

	return async (request) => {
		for (const provider of chain) {
			// An abort is the caller withdrawing the question, not this provider
			// failing. Stop the whole chain rather than asking the next one.
			if (request.signal.aborted) return null;
			try {
				const result = await provider(request);
				if (result && result.regions.length > 0) return result;
			} catch {
				/* try the next provider */
			}
		}
		return null;
	};
}

export interface ComplexityCacheOptions {
	/** Entries to keep before evicting the least recently used. Default 32. */
	max?: number;
	/**
	 * Also cache declines. Correct for a deterministic provider — a parser will
	 * refuse the same unparseable file every time, so re-asking is pure waste.
	 * Wrong for a network provider, where a decline is usually transient and
	 * caching it makes a blip permanent. Default false.
	 */
	cacheDeclines?: boolean;
}

/**
 * Memoize a provider on the exact code and language it was asked about.
 *
 * Worth having even though the editor debounces: undo, redo, and switching away
 * from a file and back all re-ask about text that has been analyzed already, and
 * for a network provider each of those is a real round trip.
 *
 * The cache is keyed on content, so it is always coherent — there is no
 * invalidation to get wrong.
 *
 * Identical requests that arrive while one is still running are joined to it
 * rather than started again. The cache alone cannot do this: an entry is only
 * written once a result exists, so two callers asking about the same document
 * before the first answer lands both miss, and both pay. For a parser that is a
 * duplicated CPU burn; for a network provider it is a duplicated round trip and
 * a duplicated bill, and it happens exactly when the answer is slowest.
 */
export function withComplexityCache(
	provider: ComplexityProvider,
	options: ComplexityCacheOptions = {}
): ComplexityProvider {
	const max = Math.max(1, options.max ?? 32);
	const cacheDeclines = options.cacheDeclines ?? false;
	// Map iteration order is insertion order, which makes it an LRU as long as a
	// hit re-inserts.
	const cache = new Map<string, Awaited<ReturnType<ComplexityProvider>>>();

	/**
	 * Requests currently in flight, by the same key as the cache.
	 *
	 * The originator's signal is kept alongside the promise because joining is
	 * only safe while that caller still wants the answer. A joiner that attaches
	 * to an attempt already abandoned would inherit a decline it had no part in.
	 */
	const inFlight = new Map<
		string,
		{ promise: Promise<Awaited<ReturnType<ComplexityProvider>>>; signal: AbortSignal }
	>();

	/**
	 * Cache key for a request, unambiguous across the language/code boundary.
	 *
	 * Length-prefixed rather than separated by a NUL escape. Both are
	 * collision-free — the point is that `("ab", "c")` and `("a", "bc")` must not
	 * share a key — but the escape did not survive packaging: the build rendered
	 * it into a literal NUL byte, so the published `dist/` shipped a file that
	 * file(1) called `data`, grep could not read and git diffed as binary, while
	 * `src/` stayed clean and the hygiene test guarding `src/` saw nothing. A
	 * length prefix cannot be rendered into anything.
	 */
	const keyOf = (request: ComplexityProviderRequest) =>
		`${request.language.length}:${request.language}${request.code}`;

	const start = (key: string, request: ComplexityProviderRequest) => {
		const promise = provider(request);
		const entry = { promise, signal: request.signal };
		inFlight.set(key, entry);
		// Cleared on settle, rejection included: a provider that throws once must
		// not pin the key to a promise that rejects for every caller afterwards.
		// The `catch` also keeps a rejection nobody joined from surfacing as an
		// unhandled rejection.
		void promise
			.catch(() => undefined)
			.finally(() => {
				if (inFlight.get(key) === entry) inFlight.delete(key);
			});
		return promise;
	};

	return async (request) => {
		const key = keyOf(request);

		if (cache.has(key)) {
			const hit = cache.get(key)!;
			cache.delete(key);
			cache.set(key, hit);
			return hit;
		}

		const shared = inFlight.get(key);
		const joined = shared && !shared.signal.aborted ? shared : null;
		let result = await (joined ? joined.promise : start(key, request));

		// The originator may have aborted DURING the attempt we joined. That check
		// at attach time is a point-in-time read and nothing revalidates it, so a
		// joiner could inherit a decline caused entirely by someone else's
		// keystroke — and then cache it, serving it to live callers until the LRU
		// evicted it 32 entries later. Measured before this: joiner got null, the
		// next live caller got null, the provider ran once.
		//
		// `null` is overloaded — it means both "declined" and "abandoned" — so the
		// only honest reading is the originator's signal. If it gave up and we did
		// not, the answer is not ours to keep; ask again.
		if (joined && joined.signal.aborted && !request.signal.aborted) {
			result = await start(key, request);
		}

		// Each caller then decides for itself, on its OWN signal — a joiner that has
		// since been abandoned must not write a cache entry on the originator's
		// behalf, and vice versa.
		//
		// Never cache a result the caller abandoned: it may be partial, and the
		// next asker deserves a real attempt.
		if (request.signal.aborted) return result;
		if (result === null && !cacheDeclines) return result;

		cache.set(key, result);
		if (cache.size > max) cache.delete(cache.keys().next().value as string);
		return result;
	};
}

/**
 * Give up on a provider that takes too long, and decline instead.
 *
 * The editor renders the built-in reading immediately and only ever refines it,
 * so a timeout costs nothing visible — where an unbounded request leaves a
 * pending refinement outstanding for as long as the model feels like taking.
 *
 * The inner provider is aborted, not merely ignored, so it stops consuming a
 * connection the moment the bound is hit.
 */
export function withComplexityTimeout(
	provider: ComplexityProvider,
	milliseconds: number
): ComplexityProvider {
	return async (request) => {
		if (request.signal.aborted) return null;

		const controller = new AbortController();
		const abortInner = () => controller.abort();
		request.signal.addEventListener('abort', abortInner, { once: true });

		let timer: ReturnType<typeof setTimeout> | undefined;
		const expiry = new Promise<null>((resolve) => {
			timer = setTimeout(() => {
				controller.abort();
				resolve(null);
			}, milliseconds);
		});

		try {
			return await Promise.race([provider({ ...request, signal: controller.signal }), expiry]);
		} catch {
			return null;
		} finally {
			clearTimeout(timer);
			request.signal.removeEventListener('abort', abortInner);
		}
	};
}
