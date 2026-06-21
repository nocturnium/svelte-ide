/**
 * Shared tokenizer test helpers.
 *
 * These operate on a tokenizer INSTANCE (not the registry) so a language's tests
 * can run before/independently of central registration in index.ts. Mirrors the
 * golden-token assertion style used in languages.test.ts.
 */
import { expect } from 'vitest';
import type { LanguageTokenizer, Token, TokenizedLine, TokenType } from './types';

/** Tokenize a single line with a tokenizer instance, returning the TokenizedLine. */
export function tok(tokenizer: LanguageTokenizer, code: string): TokenizedLine {
	return tokenizer.tokenizeLine(code, 1, tokenizer.getInitialState());
}

/** Tokenize multiple lines with a tokenizer instance, threading state between them. */
export function tokLines(tokenizer: LanguageTokenizer, lines: string[]): TokenizedLine[] {
	let state = tokenizer.getInitialState();
	const results: TokenizedLine[] = [];
	for (let i = 0; i < lines.length; i++) {
		const result = tokenizer.tokenizeLine(lines[i], i + 1, state);
		results.push(result);
		state = result.state ?? state;
	}
	return results;
}

/** Find all tokens of a given type on a line. */
export function findTokens(line: TokenizedLine, type: TokenType): Token[] {
	return line.tokens.filter((t) => t.type === type);
}

/** Assert at least one token of the given type AND exact text exists on the line. */
export function expectToken(line: TokenizedLine, type: TokenType, text: string): void {
	const matching = line.tokens.filter((t) => t.type === type && t.text === text);
	expect(
		matching.length,
		`Expected token {type: '${type}', text: '${text}'} but found none in: ${JSON.stringify(
			line.tokens.map((t) => ({ type: t.type, text: t.text }))
		)}`
	).toBeGreaterThan(0);
}

/** Assert at least one token of the given type (any text) exists on the line. */
export function expectTokenType(line: TokenizedLine, type: TokenType): void {
	const matching = line.tokens.filter((t) => t.type === type);
	expect(
		matching.length,
		`Expected at least one token of type '${type}' but found none in: ${JSON.stringify(
			line.tokens.map((t) => ({ type: t.type, text: t.text }))
		)}`
	).toBeGreaterThan(0);
}

/**
 * Assert the full concatenation of token texts reconstructs the input line exactly.
 * Every tokenizer MUST be lossless — the editor renders from tokens, so dropped or
 * duplicated characters corrupt the display. Call this in every language's suite.
 */
export function expectLossless(line: TokenizedLine, original: string): void {
	const reconstructed = line.tokens.map((t) => t.text).join('');
	expect(reconstructed, `Token reconstruction must equal the input line exactly`).toBe(original);
}
