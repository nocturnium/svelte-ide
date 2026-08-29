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
