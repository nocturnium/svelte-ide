import { describe, it, expect, vi } from 'vitest';
import {
	composeComplexityProviders,
	withComplexityCache,
	withComplexityTimeout
} from './complexity-compose';
import type { ComplexityProvider, ComplexityProviderResult } from './complexity-provider';
import { ComplexityAnalyzer } from './complexity-analyzer';
import type { Line } from './state';

const CODE = 'function f(a) {\n  if (a) return 1;\n  return 0;\n}';

const makeLines = (code: string): Line[] =>
	code.split('\n').map((text, number) => ({ number, text }));

const request = (code = CODE, signal = new AbortController().signal) => ({
	code,
	language: 'typescript',
	baseline: new ComplexityAnalyzer().analyze(makeLines(code), 'typescript'),
	signal
});

const result = (source: string): ComplexityProviderResult => ({
	regions: [{ startLine: 0, endLine: 3, cognitiveComplexity: 1 }],
	source
});

const answering =
	(source: string): ComplexityProvider =>
	async () =>
		result(source);
const declining: ComplexityProvider = async () => null;
const throwing: ComplexityProvider = async () => {
	throw new Error('network');
};

describe('composeComplexityProviders', () => {
	it('takes the first provider that answers', async () => {
		const second = vi.fn(answering('second'));
		const provider = composeComplexityProviders(answering('first'), second);

		expect((await provider(request()))?.source).toBe('first');
		expect(second).not.toHaveBeenCalled();
	});

	it('falls through a decline', async () => {
		const provider = composeComplexityProviders(declining, answering('second'));
		expect((await provider(request()))?.source).toBe('second');
	});

	it('falls through a throw, so a broken provider cannot mask a working one', async () => {
		const provider = composeComplexityProviders(throwing, answering('second'));
		expect((await provider(request()))?.source).toBe('second');
	});

	it('treats an empty region list as a decline', async () => {
		const empty: ComplexityProvider = async () => ({ regions: [], source: 'empty' });
		const provider = composeComplexityProviders(empty, answering('second'));
		expect((await provider(request()))?.source).toBe('second');
	});

	it('declines when every provider declines', async () => {
		expect(await composeComplexityProviders(declining, throwing)(request())).toBeNull();
	});

	it('ignores null and undefined entries, so chains can be built conditionally', async () => {
		const provider = composeComplexityProviders(null, undefined, answering('only'));
		expect((await provider(request()))?.source).toBe('only');
	});

	it('stops the chain on abort rather than asking the next provider', async () => {
		// An abort is the caller withdrawing the question. Continuing down the chain
		// would spend a network call on an answer nobody is waiting for.
		const controller = new AbortController();
		const second = vi.fn(answering('second'));
		const first: ComplexityProvider = async () => {
			controller.abort();
			return null;
		};

		const provider = composeComplexityProviders(first, second);
		expect(await provider(request(CODE, controller.signal))).toBeNull();
		expect(second).not.toHaveBeenCalled();
	});
});

describe('withComplexityCache', () => {
	it('asks once for identical code', async () => {
		const inner = vi.fn(answering('m'));
		const provider = withComplexityCache(inner);

		expect((await provider(request()))?.source).toBe('m');
		expect((await provider(request()))?.source).toBe('m');
		expect(inner).toHaveBeenCalledOnce();
	});

	it('asks again when the code changes', async () => {
		const inner = vi.fn(answering('m'));
		const provider = withComplexityCache(inner);

		await provider(request(CODE));
		await provider(request('function g() {}'));
		expect(inner).toHaveBeenCalledTimes(2);
	});

	it('keys on language too, so the same source in two languages is not conflated', async () => {
		const inner = vi.fn(answering('m'));
		const provider = withComplexityCache(inner);

		await provider({ ...request(), language: 'typescript' });
		await provider({ ...request(), language: 'go' });
		expect(inner).toHaveBeenCalledTimes(2);
	});

	it('does not cache a decline by default', async () => {
		// A network decline is usually transient; caching it would make a blip
		// permanent for as long as the file is unchanged.
		const inner = vi.fn(declining);
		const provider = withComplexityCache(inner);

		await provider(request());
		await provider(request());
		expect(inner).toHaveBeenCalledTimes(2);
	});

	it('caches a decline when told to, for deterministic providers', async () => {
		const inner = vi.fn(declining);
		const provider = withComplexityCache(inner, { cacheDeclines: true });

		await provider(request());
		await provider(request());
		expect(inner).toHaveBeenCalledOnce();
	});

	it('never caches a result the caller abandoned', async () => {
		const controller = new AbortController();
		const inner = vi.fn(async () => {
			controller.abort();
			return result('partial');
		});
		const provider = withComplexityCache(inner);

		await provider(request(CODE, controller.signal));
		await provider(request());
		expect(inner).toHaveBeenCalledTimes(2);
	});

	// Every other test in this block awaits one call before making the next, so
	// the cache is always already written by the time the second asks. That is
	// precisely the shape that cannot see a missing in-flight dedup: an entry is
	// only written once a result exists, so concurrent callers all miss and all
	// pay. These fire the second request while the first is still pending.
	describe('concurrent identical requests', () => {
		/** A provider whose answer is released by the test, not by a timer. */
		const deferred = () => {
			let release!: (value: ComplexityProviderResult | null) => void;
			const gate = new Promise<ComplexityProviderResult | null>((r) => (release = r));
			const provider = vi.fn(async () => gate);
			return { provider, release };
		};

		it('asks once when two callers overlap on the same document', async () => {
			const { provider: inner, release } = deferred();
			const provider = withComplexityCache(inner);

			const a = provider(request());
			const b = provider(request());
			release(result('m'));

			expect((await a)?.source).toBe('m');
			expect((await b)?.source).toBe('m');
			expect(inner).toHaveBeenCalledTimes(1);
		});

		it('still asks separately for different documents', async () => {
			const { provider: inner, release } = deferred();
			const provider = withComplexityCache(inner);

			const a = provider(request('function a() {}'));
			const b = provider(request('function b() {}'));
			release(result('m'));

			await Promise.all([a, b]);
			expect(inner).toHaveBeenCalledTimes(2);
		});

		it('stops sharing once the answer has landed, so the cache takes over', async () => {
			const { provider: inner, release } = deferred();
			const provider = withComplexityCache(inner);

			const a = provider(request());
			release(result('m'));
			await a;

			// A later ask is a cache hit, not a join — and the in-flight entry must
			// have been cleared, or the key would be pinned to a settled promise.
			expect((await provider(request()))?.source).toBe('m');
			expect(inner).toHaveBeenCalledTimes(1);
		});

		it('does not join an attempt whose originator has already given up', async () => {
			// The joiner would inherit a decline it had no part in. The editor
			// aborts on every keystroke, so an abandoned attempt is the common case,
			// not the exotic one.
			const controller = new AbortController();
			const { provider: inner, release } = deferred();
			const provider = withComplexityCache(inner);

			const abandoned = provider(request(CODE, controller.signal));
			controller.abort();

			const fresh = provider(request());
			release(result('m'));

			await Promise.all([abandoned, fresh]);
			expect(inner).toHaveBeenCalledTimes(2);
		});

		it('does not pin a key to a rejected attempt', async () => {
			// A provider that throws once must not poison the key: without clearing
			// the in-flight entry on rejection, every later caller would await the
			// same settled rejection forever.
			const inner = vi.fn(throwing);
			const provider = withComplexityCache(inner);

			await expect(provider(request())).rejects.toThrow('network');

			const second = vi.fn(answering('recovered'));
			const recovered = withComplexityCache(second);
			expect((await recovered(request()))?.source).toBe('recovered');

			// And the original wrapper retries rather than replaying the rejection.
			await expect(provider(request())).rejects.toThrow('network');
			expect(inner).toHaveBeenCalledTimes(2);
		});

		it('lets each caller decide on its own signal, not the originator s', async () => {
			const joinerAbort = new AbortController();
			const { provider: inner, release } = deferred();
			const provider = withComplexityCache(inner);

			const originator = provider(request());
			const joiner = provider(request(CODE, joinerAbort.signal));
			joinerAbort.abort();
			release(result('m'));
			await Promise.all([originator, joiner]);

			// The joiner abandoned its request, but the originator did not, so the
			// result is cached and a third ask is free.
			expect((await provider(request()))?.source).toBe('m');
			expect(inner).toHaveBeenCalledTimes(1);
		});
	});

	it('evicts least-recently-used past the bound', async () => {
		const inner = vi.fn(answering('m'));
		const provider = withComplexityCache(inner, { max: 2 });

		await provider(request('a')); // [a]
		await provider(request('b')); // [a, b]
		await provider(request('a')); // hit, so a is now newest: [b, a]
		await provider(request('c')); // evicts b: [a, c]
		expect(inner).toHaveBeenCalledTimes(3);

		await provider(request('a')); // still cached
		expect(inner).toHaveBeenCalledTimes(3);

		await provider(request('b')); // was evicted
		expect(inner).toHaveBeenCalledTimes(4);
	});
});

describe('withComplexityTimeout', () => {
	it('passes a fast result through', async () => {
		const provider = withComplexityTimeout(answering('fast'), 1000);
		expect((await provider(request()))?.source).toBe('fast');
	});

	it('declines when the provider overruns', async () => {
		vi.useFakeTimers();
		try {
			const slow: ComplexityProvider = () => new Promise(() => {});
			const promise = withComplexityTimeout(slow, 50)(request());
			await vi.advanceTimersByTimeAsync(60);
			expect(await promise).toBeNull();
		} finally {
			vi.useRealTimers();
		}
	});

	it('aborts the inner provider, rather than leaving it running', async () => {
		vi.useFakeTimers();
		try {
			let innerSignal: AbortSignal | undefined;
			const slow: ComplexityProvider = (req) => {
				innerSignal = req.signal;
				return new Promise(() => {});
			};

			const promise = withComplexityTimeout(slow, 50)(request());
			await vi.advanceTimersByTimeAsync(60);
			await promise;
			expect(innerSignal?.aborted).toBe(true);
		} finally {
			vi.useRealTimers();
		}
	});

	it('aborts the inner provider when the caller aborts', async () => {
		let innerSignal: AbortSignal | undefined;
		const slow: ComplexityProvider = (req) => {
			innerSignal = req.signal;
			return new Promise(() => {});
		};

		const controller = new AbortController();
		void withComplexityTimeout(slow, 10_000)(request(CODE, controller.signal));
		await Promise.resolve();
		controller.abort();

		expect(innerSignal?.aborted).toBe(true);
	});

	it('declines rather than propagating a throw', async () => {
		expect(await withComplexityTimeout(throwing, 1000)(request())).toBeNull();
	});

	it('declines immediately when already aborted', async () => {
		const controller = new AbortController();
		controller.abort();
		const inner = vi.fn(answering('m'));

		expect(await withComplexityTimeout(inner, 1000)(request(CODE, controller.signal))).toBeNull();
		expect(inner).not.toHaveBeenCalled();
	});
});

describe('a realistic chain', () => {
	it('bounds a slow provider, falls back, and caches the outcome', async () => {
		vi.useFakeTimers();
		try {
			const slow: ComplexityProvider = () => new Promise(() => {});
			const fallback = vi.fn(answering('scanner-plus'));

			const provider = withComplexityCache(
				composeComplexityProviders(withComplexityTimeout(slow, 50), fallback)
			);

			const first = provider(request());
			await vi.advanceTimersByTimeAsync(60);
			expect((await first)?.source).toBe('scanner-plus');

			// Second ask is served from cache — the slow provider is not re-tried.
			expect((await provider(request()))?.source).toBe('scanner-plus');
			expect(fallback).toHaveBeenCalledOnce();
		} finally {
			vi.useRealTimers();
		}
	});
});
