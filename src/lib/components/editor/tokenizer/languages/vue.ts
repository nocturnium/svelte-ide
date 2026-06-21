/**
 * Vue Single-File Component tokenizer for syntax highlighting
 *
 * Supports:
 * - Top-level <template>, <script> (with `setup` / `lang="ts"`) and <style> blocks
 * - Inside <template>: HTML tags, attributes, Vue directives (v-if, v-for, v-bind,
 *   v-on, v-model, v-show, v-html, ...) and their shorthands `:` (v-bind),
 *   `@` (v-on) and `#` (v-slot)
 * - Mustache interpolation {{ expr }} with the inner expression tokenized
 * - Inside <script>: delegated to the JavaScript/TypeScript tokenizer
 * - Inside <style>: delegated to the CSS tokenizer
 *
 * Block context and the active child tokenizer state are threaded via the
 * returned `state` so multi-line <script>/<style> bodies resume correctly.
 */

import type { LanguageTokenizer, Token, TokenizedLine, TokenizerState } from '../types';
import { createJavaScriptTokenizer, createTypeScriptTokenizer } from './javascript';
import { createCSSTokenizer } from './css';

/**
 * Lightweight token shape used while building tokens in document order.
 * Start/end positions are assigned in a single re-index pass before returning.
 */
type RawToken = Pick<Token, 'type' | 'text'>;

/**
 * Assign sequential start/end positions to tokens in document order.
 * Token N starts where token N-1 ended, since tokens render left-to-right.
 */
function reindexTokens(tokens: RawToken[]): Token[] {
	let cursor = 0;
	return tokens.map((t) => {
		const start = cursor;
		const end = start + t.text.length;
		cursor = end;
		return { type: t.type, text: t.text, start, end };
	});
}

/**
 * Vue-specific tokenizer state.
 */
export interface VueTokenizerState extends TokenizerState {
	/** Current context: 'template', 'script', or 'style' */
	context: 'template' | 'script' | 'style';
	/** Which script flavour the open <script> uses (lang="ts" => 'ts') */
	scriptLang?: 'js' | 'ts';
	/** Child (script/style) tokenizer state */
	innerState?: TokenizerState;
	/** Inside a multi-line HTML comment `<!-- ... -->` opened on a previous line */
	inHtmlComment?: boolean;
	/** Inside a multi-line mustache `{{ ... }}` opened on a previous line */
	inMustache?: boolean;
	/** Inside an open start-tag `<el ...` whose `>` lands on a later line */
	inTag?: boolean;
}

/**
 * Vue tokenizer.
 */
export class VueTokenizer implements LanguageTokenizer {
	language = 'vue';
	private jsTokenizer: LanguageTokenizer;
	private tsTokenizer: LanguageTokenizer;
	private cssTokenizer: LanguageTokenizer;

	constructor() {
		this.jsTokenizer = createJavaScriptTokenizer();
		this.tsTokenizer = createTypeScriptTokenizer();
		this.cssTokenizer = createCSSTokenizer();
	}

	getInitialState(): VueTokenizerState {
		return {
			context: 'template'
		};
	}

	tokenizeLine(line: string, lineNumber: number, prevState?: VueTokenizerState): TokenizedLine {
		const tokens: RawToken[] = [];
		const state: VueTokenizerState = {
			...this.getInitialState(),
			...prevState,
			innerState: prevState?.innerState ? { ...prevState.innerState } : undefined
		};

		// Resume an open <script> block.
		if (state.context === 'script') {
			const closeMatch = line.match(/<\/script>/i);
			const child = state.scriptLang === 'ts' ? this.tsTokenizer : this.jsTokenizer;
			if (closeMatch) {
				const scriptPart = line.slice(0, closeMatch.index);
				if (scriptPart) {
					const result = child.tokenizeLine(
						scriptPart,
						lineNumber,
						state.innerState ?? child.getInitialState()
					);
					tokens.push(...result.tokens);
				}
				tokens.push({ type: 'tag.punctuation', text: '</' });
				tokens.push({ type: 'tag.name', text: 'script' });
				tokens.push({ type: 'tag.punctuation', text: '>' });

				state.context = 'template';
				state.scriptLang = undefined;
				state.innerState = undefined;
				const rest = line.slice(closeMatch.index! + closeMatch[0].length);
				if (rest) {
					tokens.push(...this.tokenizeTemplate(rest, state));
				}
			} else {
				const result = child.tokenizeLine(
					line,
					lineNumber,
					state.innerState ?? child.getInitialState()
				);
				tokens.push(...result.tokens);
				state.innerState = result.state;
			}
			return { lineNumber, tokens: reindexTokens(tokens), text: line, state };
		}

		// Resume an open <style> block.
		if (state.context === 'style') {
			const closeMatch = line.match(/<\/style>/i);
			if (closeMatch) {
				const stylePart = line.slice(0, closeMatch.index);
				if (stylePart) {
					const result = this.cssTokenizer.tokenizeLine(
						stylePart,
						lineNumber,
						state.innerState ?? this.cssTokenizer.getInitialState()
					);
					tokens.push(...result.tokens);
				}
				tokens.push({ type: 'tag.punctuation', text: '</' });
				tokens.push({ type: 'tag.name', text: 'style' });
				tokens.push({ type: 'tag.punctuation', text: '>' });

				state.context = 'template';
				state.innerState = undefined;
				const rest = line.slice(closeMatch.index! + closeMatch[0].length);
				if (rest) {
					tokens.push(...this.tokenizeTemplate(rest, state));
				}
			} else {
				const result = this.cssTokenizer.tokenizeLine(
					line,
					lineNumber,
					state.innerState ?? this.cssTokenizer.getInitialState()
				);
				tokens.push(...result.tokens);
				state.innerState = result.state;
			}
			return { lineNumber, tokens: reindexTokens(tokens), text: line, state };
		}

		// Template context.
		tokens.push(...this.tokenizeTemplate(line, state));
		return { lineNumber, tokens: reindexTokens(tokens), text: line, state };
	}

	private tokenizeTemplate(line: string, state: VueTokenizerState): RawToken[] {
		const tokens: RawToken[] = [];
		let pos = 0;

		// Resume a multi-line HTML comment opened on a previous line.
		if (state.inHtmlComment) {
			const closeIdx = line.indexOf('-->');
			if (closeIdx === -1) {
				// Whole line is still inside the comment.
				if (line) {
					tokens.push({ type: 'comment', text: line });
				}
				return tokens;
			}
			const commentPart = line.slice(0, closeIdx + 3);
			tokens.push({ type: 'comment', text: commentPart });
			state.inHtmlComment = false;
			pos = closeIdx + 3;
		}

		// Resume a multi-line mustache `{{ ... }}` opened on a previous line.
		if (state.inMustache) {
			const closeIdx = line.indexOf('}}');
			if (closeIdx === -1) {
				// Whole line is still inside the interpolation expression.
				if (line) {
					tokens.push(...this.tokenizeJSExpression(line));
				}
				return tokens;
			}
			const expr = line.slice(0, closeIdx);
			if (expr) {
				tokens.push(...this.tokenizeJSExpression(expr));
			}
			tokens.push({ type: 'punctuation.brace', text: '}}' });
			state.inMustache = false;
			pos = closeIdx + 2;
		}

		// Resume an open start-tag whose `>` landed on a later line. Parse the
		// attribute region (and the closing `>` / `/>`) here; everything after the
		// close is handled by the main template loop below.
		if (state.inTag) {
			const endIdx = this.indexOfTagEnd(line);
			if (endIdx === -1) {
				// Still open — the whole line is attribute region; stay in-tag.
				tokens.push(...this.tokenizeTagBody(line));
				return tokens;
			}
			// Include the closing punctuation (`>` or the `/` of `/>`) so the body
			// parser emits it as tag.punctuation.
			const closeLen = line[endIdx] === '/' ? 2 : 1;
			tokens.push(...this.tokenizeTagBody(line.slice(0, endIdx + closeLen)));
			state.inTag = false;
			pos = endIdx + closeLen;
		}

		while (pos < line.length) {
			const rest = line.slice(pos);
			const char = line[pos];

			// <script ...> opening tag — switch context after the tag closes.
			const scriptMatch = rest.match(/^<script(\s+[^>]*)?>?/i);
			if (scriptMatch && /^<script(\s|>|$)/i.test(rest)) {
				tokens.push(...this.tokenizeTag(scriptMatch[0]));
				pos += scriptMatch[0].length;
				if (scriptMatch[0].endsWith('>')) {
					state.context = 'script';
					state.scriptLang = /lang\s*=\s*["']ts["']/i.test(scriptMatch[0]) ? 'ts' : 'js';
					const child = state.scriptLang === 'ts' ? this.tsTokenizer : this.jsTokenizer;
					state.innerState = child.getInitialState();
					// Tokenize any inline body after the opening tag on the same line.
					const inline = line.slice(pos);
					if (inline) {
						tokens.push(...this.tokenizeLine(inline, 0, state).tokens);
						pos = line.length;
					}
				}
				continue;
			}

			// <style ...> opening tag.
			const styleMatch = rest.match(/^<style(\s+[^>]*)?>?/i);
			if (styleMatch && /^<style(\s|>|$)/i.test(rest)) {
				tokens.push(...this.tokenizeTag(styleMatch[0]));
				pos += styleMatch[0].length;
				if (styleMatch[0].endsWith('>')) {
					state.context = 'style';
					state.innerState = this.cssTokenizer.getInitialState();
					const inline = line.slice(pos);
					if (inline) {
						tokens.push(...this.tokenizeLine(inline, 0, state).tokens);
						pos = line.length;
					}
				}
				continue;
			}

			// Mustache interpolation: {{ expr }}
			if (char === '{' && line[pos + 1] === '{') {
				const endIdx = rest.indexOf('}}', 2);
				if (endIdx !== -1) {
					const expr = rest.slice(2, endIdx);
					tokens.push({ type: 'punctuation.brace', text: '{{' });
					if (expr) {
						tokens.push(...this.tokenizeJSExpression(expr));
					}
					tokens.push({ type: 'punctuation.brace', text: '}}' });
					pos += endIdx + 2;
				} else {
					// Unterminated mustache — emit opener + inner expr and thread the
					// open-mustache state so following lines resume as interpolation
					// until the closing `}}`.
					tokens.push({ type: 'punctuation.brace', text: '{{' });
					const expr = rest.slice(2);
					if (expr) {
						tokens.push(...this.tokenizeJSExpression(expr));
					}
					state.inMustache = true;
					pos = line.length;
				}
				continue;
			}

			// HTML comments (may span multiple lines)
			if (rest.startsWith('<!--')) {
				const closeIdx = rest.indexOf('-->', 4);
				if (closeIdx !== -1) {
					const commentText = rest.slice(0, closeIdx + 3);
					tokens.push({ type: 'comment', text: commentText });
					pos += commentText.length;
				} else {
					// Unterminated on this line — consume the rest and thread the
					// open-comment state so following lines resume as comment.
					tokens.push({ type: 'comment', text: rest });
					state.inHtmlComment = true;
					pos = line.length;
				}
				continue;
			}

			// HTML tags (opening / closing / self-closing). The match may run to
			// end-of-line when the `>` lands on a later line; in that case thread
			// `inTag` so the following line(s) resume attribute parsing rather than
			// bleeding the attributes out as plain template text.
			if (char === '<' && /^<\/?[\w.-]/.test(rest)) {
				const tagMatch = rest.match(/^<\/?[\w.-]+(?:\s+[^>]*)?\/?>?/);
				if (tagMatch) {
					const tag = tagMatch[0];
					tokens.push(...this.tokenizeTag(tag));
					pos += tag.length;
					// An opening tag (not `</...`) that did not close on this line —
					// no `>` and no self-closing `/>` terminator was consumed. Thread
					// `inTag` so following lines resume attribute parsing instead of
					// bleeding the attributes out as plain template text.
					if (!tag.startsWith('</') && !/\/?>$/.test(tag)) {
						state.inTag = true;
						pos = line.length;
					}
					continue;
				}
			}

			// Plain text up to the next `<` or `{`.
			const textMatch = rest.match(/^[^<{]+/);
			if (textMatch) {
				tokens.push({ type: 'text', text: textMatch[0] });
				pos += textMatch[0].length;
				continue;
			}

			// Fallback: single char (e.g. a lone `{` not part of `{{`).
			tokens.push({ type: 'text', text: char });
			pos++;
		}

		return tokens;
	}

	private tokenizeTag(tag: string): RawToken[] {
		const tokens: RawToken[] = [];
		let pos = 0;

		// Opening bracket
		if (tag.startsWith('</')) {
			tokens.push({ type: 'tag.punctuation', text: '</' });
			pos = 2;
		} else {
			tokens.push({ type: 'tag.punctuation', text: '<' });
			pos = 1;
		}

		// Tag name
		const nameMatch = tag.slice(pos).match(/^[\w.-]+/);
		if (nameMatch) {
			tokens.push({ type: 'tag.name', text: nameMatch[0] });
			pos += nameMatch[0].length;
		}

		// Attributes / directives / closing bracket(s).
		tokens.push(...this.tokenizeTagBody(tag.slice(pos)));
		return tokens;
	}

	/**
	 * Tokenize the attribute region of a tag (everything after `<name`): whitespace,
	 * attributes/directives with optional `=value`, and the closing `>` / `/>`. This
	 * is split out so an opening tag whose `>` lands on a later line can resume here
	 * line-by-line via the threaded `inTag` state.
	 */
	private tokenizeTagBody(body: string): RawToken[] {
		const tokens: RawToken[] = [];
		let pos = 0;

		while (pos < body.length) {
			const rest = body.slice(pos);

			// Whitespace
			const wsMatch = rest.match(/^\s+/);
			if (wsMatch) {
				tokens.push({ type: 'text', text: wsMatch[0] });
				pos += wsMatch[0].length;
				continue;
			}

			// Closing bracket(s): `>` or `/>`
			if (rest.startsWith('/>') || rest[0] === '>') {
				const closing = rest.startsWith('/>') ? '/>' : '>';
				tokens.push({ type: 'tag.punctuation', text: closing });
				pos += closing.length;
				continue;
			}

			// Attribute name, incl. Vue directives (v-if) and the shorthands
			// `:` (v-bind), `@` (v-on) and `#` (v-slot), plus modifiers like
			// `@click.stop` or `:class`. All render as tag.attribute.
			//
			// The `v-…` branch must come FIRST: a full directive with an argument
			// like `v-bind:class` / `v-model:value` / `v-on:click.stop` must stay a
			// single token. If the generic branch ran first it would match only the
			// `v-bind` prefix and leave `:class` to re-parse as a *separate* v-bind
			// shorthand — a different (wrong) attribute.
			const attrMatch = rest.match(/^(v-[\w-]+(?::[\w.[\]-]+)?(?:\.[\w-]+)*|[@:#]?[\w.[\]-]+)/);
			if (attrMatch) {
				const attrName = attrMatch[0];
				tokens.push({ type: 'tag.attribute', text: attrName });
				pos += attrName.length;

				// Optional `=value`
				const afterName = body.slice(pos);
				if (afterName[0] === '=') {
					tokens.push({ type: 'punctuation', text: '=' });
					pos += 1;

					const valueMatch = body.slice(pos).match(/^(?:"[^"]*"|'[^']*'|[^\s>]+)/);
					if (valueMatch) {
						tokens.push({ type: 'tag.attribute.value', text: valueMatch[0] });
						pos += valueMatch[0].length;
					}
				}
				continue;
			}

			// Anything else — emit a single char to stay lossless.
			tokens.push({ type: 'text', text: body[pos] });
			pos++;
		}

		return tokens;
	}

	/**
	 * Find the index of the `>` (or `/>`) that ends an open start-tag on a resumed
	 * line, skipping over `>` characters that sit inside quoted attribute values.
	 * Returns the index of `>` (for `/>` the `/` is one before), or -1 if the tag
	 * still does not close on this line.
	 */
	private indexOfTagEnd(line: string): number {
		let quote: string | null = null;
		for (let i = 0; i < line.length; i++) {
			const ch = line[i];
			if (quote) {
				if (ch === quote) quote = null;
				continue;
			}
			if (ch === '"' || ch === "'") {
				quote = ch;
				continue;
			}
			if (ch === '>') {
				return line[i - 1] === '/' ? i - 1 : i;
			}
		}
		return -1;
	}

	private tokenizeJSExpression(expression: string): RawToken[] {
		const result = this.jsTokenizer.tokenizeLine(expression, 1, this.jsTokenizer.getInitialState());
		return result.tokens;
	}
}

/**
 * Create a Vue tokenizer.
 */
export function createVueTokenizer(): LanguageTokenizer {
	return new VueTokenizer();
}
