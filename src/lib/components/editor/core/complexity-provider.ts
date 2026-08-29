/**
 * Pluggable complexity analysis.
 *
 * The built-in analyzer is a token scanner. It is instant, offline, works on
 * every language the tokenizer knows, and needs no configuration — which is why
 * it is the default. It is also an approximation of a parser, and four rounds of
 * review established what that costs: it has been repeatedly, confidently wrong
 * in ways nothing inside this repository could detect. A differential harness
 * now pins it against an AST reference, but that reference only speaks JS and TS,
 * while the tokenizer ships 32 languages.
 *
 * Rather than keep guessing harder, this seam lets a consumer supply something
 * that actually parses — their own AST pass, a language server, or a small model
 * on a local Ollama endpoint or a hosted one. The library defines the contract
 * and ships transports; it never calls a model itself, so the package keeps its
 * zero runtime dependencies and no code leaves a machine unless the consumer
 * wires it to.
 *
 * The contract is deliberately additive. The built-in result is computed first
 * and rendered immediately, so typing is never blocked and a slow or failing
 * provider degrades to exactly today's behaviour. A provider refines that
 * baseline; it does not gate it.
 */

import type {
	ComplexityContribution,
	ComplexityMetrics,
	ComplexityRegion
} from './complexity-analyzer';

/** Where a displayed complexity reading came from. */
export type ComplexitySource = 'builtin' | 'provider';

export interface ComplexityProviderRequest {
	/** Full document text. */
	code: string;
	/** Language id, as passed to the editor. */
	language: string;
	/**
	 * What the built-in scanner computed. Supplied so a provider can refine a
	 * baseline rather than start cold, and so a model can be asked to correct
	 * specific regions instead of re-deriving the whole file.
	 */
	baseline: ComplexityMetrics;
	/** Aborted when the document changes again or the editor unmounts. */
	signal: AbortSignal;
}

/**
 * One region as reported by a provider. Line numbers are 0-based and inclusive,
 * matching {@link ComplexityRegion}.
 */
export interface ProvidedComplexityRegion {
	startLine: number;
	endLine: number;
	cognitiveComplexity: number;
	name?: string;
	/** Optional per-increment breakdown; rendered by the hover tooltip. */
	contributions?: ComplexityContribution[];
}

export interface ComplexityProviderResult {
	regions: ProvidedComplexityRegion[];
	/**
	 * Human-readable provenance shown next to the number — a model id, a tool
	 * name. Consumers should say what produced the reading so a viewer can weigh
	 * it; the UI labels an unnamed provider simply as "provider".
	 */
	source?: string;
}

/**
 * Returns refined regions, or null to decline (leaving the built-in result in
 * place). Throwing is also safe — the editor treats any failure as declining.
 */
export type ComplexityProvider = (
	request: ComplexityProviderRequest
) => Promise<ComplexityProviderResult | null>;

/**
 * Minimal transport: given a prompt, return the model's text. Anything that can
 * turn a string into a string works — a local Ollama server, a hosted endpoint,
 * a queue, a stub in a test.
 *
 * Kept this narrow on purpose. Encoding a specific vendor's request and response
 * shapes into this package would mean shipping and maintaining an API surface
 * that cannot be tested here and dates the moment the vendor revises it.
 */
export type ChatCompletion = (prompt: string, signal: AbortSignal) => Promise<string>;

/**
 * The instruction sent to a model. Exported so consumers can inspect, adapt, or
 * replace it — a prompt is not something a library should hide.
 *
 * It asks for the same metric the built-in computes, cites the rules rather than
 * naming a threshold to hit, and demands strict JSON so the reply can be
 * validated instead of trusted.
 */
export function buildComplexityPrompt(request: ComplexityProviderRequest): string {
	const numbered = request.code
		.split('\n')
		.map((line, i) => `${i}: ${line}`)
		.join('\n');

	return `You are computing SonarSource Cognitive Complexity for ${request.language} code.

Rules:
- +1 for each: if, else if, else, ternary, switch, loop, catch, a sequence of like
  boolean operators, a labelled break/continue, and direct recursion.
- if / ternary / switch / loop / catch ALSO take a nesting penalty equal to how many
  of those structures enclose them. else, else-if, boolean sequences and jumps do not.
- Nesting is structural, not brace-based: a braceless body still nests.
- Ignore null-coalescing and optional chaining entirely. They introduce no branch.
- Score every named function separately. Do not score classes.

Answer with JSON only. No explanation, no reasoning, no code fences. Begin your
reply with { and end it with }.

Schema — <...> are placeholders, NOT values to copy:
{"regions":[{"startLine":<int>,"endLine":<int>,"name":"<string>","cognitiveComplexity":<int>}]}

startLine and endLine are 0-based and inclusive, referring to the numbered lines below.

CODE:
${numbered}`;
}

/** Thrown shapes are caught by the editor; this is for tests and diagnostics. */
export class ComplexityProviderError extends Error {}

/**
 * Find the LAST balanced `{...}` in `text` that parses and carries a `regions`
 * array.
 *
 * Spanning the first `{` to the last `}` seemed sufficient until a reasoning
 * model was pointed at it: those emit paragraphs of prose that quote the code —
 * braces and all — before answering, so the naive span swallowed the reasoning
 * and parsed nothing. Scanning balanced candidates and taking the last valid one
 * finds the answer whether or not the model was asked to think out loud.
 */
function findRegionsObject(text: string): { regions?: unknown } | null {
	let best: { regions?: unknown } | null = null;

	for (let i = 0; i < text.length; i++) {
		if (text[i] !== '{') continue;
		let depth = 0;
		let inString = false;
		let quote = '';
		for (let j = i; j < text.length; j++) {
			const c = text[j];
			if (inString) {
				if (c === '\\') j++;
				else if (c === quote) inString = false;
				continue;
			}
			if (c === '"' || c === "'") {
				inString = true;
				quote = c;
				continue;
			}
			if (c === '{') depth++;
			else if (c === '}') {
				depth--;
				if (depth === 0) {
					try {
						const candidate = JSON.parse(text.slice(i, j + 1)) as { regions?: unknown };
						if (candidate && typeof candidate === 'object' && Array.isArray(candidate.regions)) {
							best = candidate;
						}
					} catch {
						/* not JSON — keep scanning */
					}
					i = j; // resume after this candidate
					break;
				}
			}
		}
	}
	return best;
}

/**
 * Parse and VALIDATE a model reply. Never trusts the text: anything malformed,
 * out of range, or negative is dropped rather than rendered, because a wrong
 * number displayed confidently is the exact failure this whole seam exists to
 * escape.
 */
export function parseComplexityResponse(
	text: string,
	lineCount: number
): ComplexityProviderResult | null {
	// Models wrap JSON in fences even when told not to.
	const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
	const raw = (fenced ? fenced[1] : text).trim();

	const parsed = findRegionsObject(raw);
	if (!parsed) return null;
	const regionsRaw = parsed.regions;
	if (!Array.isArray(regionsRaw)) return null;

	const regions: ProvidedComplexityRegion[] = [];
	for (const entry of regionsRaw) {
		if (typeof entry !== 'object' || entry === null) continue;
		const r = entry as Record<string, unknown>;
		const startLine = r.startLine;
		const endLine = r.endLine;
		const cc = r.cognitiveComplexity;

		if (
			typeof startLine !== 'number' ||
			typeof endLine !== 'number' ||
			typeof cc !== 'number' ||
			!Number.isFinite(startLine) ||
			!Number.isFinite(endLine) ||
			!Number.isFinite(cc) ||
			!Number.isInteger(cc) ||
			cc < 0 ||
			startLine < 0 ||
			endLine < startLine ||
			startLine >= lineCount
		) {
			continue;
		}

		regions.push({
			startLine: Math.floor(startLine),
			endLine: Math.min(Math.floor(endLine), lineCount - 1),
			cognitiveComplexity: cc,
			name: typeof r.name === 'string' ? r.name : undefined
		});
	}

	return regions.length > 0 ? { regions } : null;
}

/**
 * Build a provider from any {@link ChatCompletion}.
 *
 * Declines (returns null) on a malformed reply rather than rendering it, so a
 * confused model leaves the built-in reading in place instead of replacing it
 * with nonsense.
 */
export function createChatComplexityProvider(
	complete: ChatCompletion,
	options: { source?: string } = {}
): ComplexityProvider {
	return async (request) => {
		const text = await complete(buildComplexityPrompt(request), request.signal);
		const result = parseComplexityResponse(text, request.code.split('\n').length);
		if (!result) return null;
		return { ...result, source: options.source };
	};
}

/**
 * Output cap for the bundled transports.
 *
 * Without one, a reasoning model spends its entire budget thinking and never
 * reaches the JSON — measured against a local llama.cpp proxy, two Qwen3 builds
 * produced ~4000 characters of prose and no answer, so the provider declined
 * every time. The reply this asks for is a few hundred characters; the cap is
 * generous for that and hostile to rambling.
 */
export const DEFAULT_MAX_TOKENS = 1200;

async function postJson(
	url: string,
	body: unknown,
	signal: AbortSignal,
	headers: Record<string, string>
): Promise<unknown> {
	const response = await fetch(url, {
		method: 'POST',
		signal,
		headers: { 'Content-Type': 'application/json', ...headers },
		body: JSON.stringify(body)
	});
	if (!response.ok) {
		throw new ComplexityProviderError(`${response.status} ${response.statusText}`);
	}
	return response.json();
}

/**
 * Ollama, or anything serving its `/api/generate` shape.
 *
 * Uses only `fetch`, so it adds no dependency. Point it at a model small enough
 * to answer in the time between keystrokes — the editor debounces and aborts, so
 * a slow model costs nothing but staleness.
 *
 * @example
 * ```ts
 * const provider = createOllamaComplexityProvider({ model: 'qwen2.5-coder:1.5b' });
 * <CustomEditor complexityHighlighting complexityProvider={provider} />
 * ```
 */
export function createOllamaComplexityProvider(options: {
	model: string;
	/** Defaults to a local Ollama. */
	endpoint?: string;
	headers?: Record<string, string>;
}): ComplexityProvider {
	const endpoint = options.endpoint ?? 'http://localhost:11434/api/generate';
	return createChatComplexityProvider(
		async (prompt, signal) => {
			const data = (await postJson(
				endpoint,
				{ model: options.model, prompt, stream: false, options: { temperature: 0 } },
				signal,
				options.headers ?? {}
			)) as { response?: unknown };
			return typeof data.response === 'string' ? data.response : '';
		},
		{ source: options.model }
	);
}

/**
 * Any OpenAI-compatible `/chat/completions` endpoint — which most hosted and
 * self-hosted servers now speak, including llama.cpp, vLLM and LM Studio.
 *
 * The API key is supplied by the consumer and sent only to the endpoint they
 * name. This package never has a default endpoint with a key.
 */
export function createOpenAICompatibleComplexityProvider(options: {
	model: string;
	endpoint: string;
	apiKey?: string;
	headers?: Record<string, string>;
}): ComplexityProvider {
	return createChatComplexityProvider(
		async (prompt, signal) => {
			const data = (await postJson(
				options.endpoint,
				{
					model: options.model,
					temperature: 0,
					messages: [{ role: 'user', content: prompt }]
				},
				signal,
				{
					...(options.apiKey ? { Authorization: `Bearer ${options.apiKey}` } : {}),
					...(options.headers ?? {})
				}
			)) as { choices?: Array<{ message?: { content?: unknown } }> };
			const content = data.choices?.[0]?.message?.content;
			return typeof content === 'string' ? content : '';
		},
		{ source: options.model }
	);
}

/**
 * Fold a provider's regions into the built-in metrics.
 *
 * Provider regions REPLACE built-in ones they overlap, and unmatched built-in
 * regions survive — so a provider that reports only what it is confident about
 * improves those readings without erasing the rest of the file.
 */
export function mergeProvidedComplexity(
	baseline: ComplexityMetrics,
	provided: ComplexityProviderResult,
	getLevel: (cc: number) => ComplexityMetrics['level']
): ComplexityMetrics {
	const overlaps = (a: { startLine: number; endLine: number }, b: ComplexityRegion) =>
		a.startLine <= b.endLine && b.startLine <= a.endLine;

	const kept = baseline.regions.filter((r) => !provided.regions.some((p) => overlaps(p, r)));

	const merged: ComplexityRegion[] = [
		...kept,
		...provided.regions.map((p) => {
			const nearest = baseline.regions.find((r) => overlaps(p, r));
			return {
				startLine: p.startLine,
				endLine: p.endLine,
				name: p.name ?? nearest?.name,
				type: nearest?.type ?? ('function' as const),
				cognitiveComplexity: p.cognitiveComplexity,
				level: getLevel(p.cognitiveComplexity),
				score: nearest?.score ?? 0,
				factors: nearest?.factors ?? {
					nestingDepth: 0,
					branchingFactor: 0,
					lineCount: p.endLine - p.startLine + 1,
					identifierCount: 0,
					callCount: 0
				},
				suggestion: nearest?.suggestion,
				contributions: p.contributions ?? []
			};
		})
	].sort((a, b) => a.startLine - b.startLine);

	const functions = merged.filter((r) => r.type === 'function');
	const pool = functions.length > 0 ? functions : merged;
	const maxCognitiveComplexity = pool.reduce((m, r) => Math.max(m, r.cognitiveComplexity), 0);

	return {
		...baseline,
		regions: merged,
		maxCognitiveComplexity,
		level: getLevel(maxCognitiveComplexity),
		totalCognitiveComplexity: merged.reduce((t, r) => t + r.cognitiveComplexity, 0)
	};
}
