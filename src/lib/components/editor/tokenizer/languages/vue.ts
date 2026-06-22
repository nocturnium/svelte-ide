/**
 * Vue Single-File Component tokenizer for syntax highlighting
 *
 * Supports:
 * - Top-level <template>, <script> (with `setup` / `lang="ts"`) and <style> blocks,
 *   including opening tags whose `>` lands on a later line (multi-line threading).
 * - Inside <template>: HTML tags, attributes, Vue directives (v-if, v-for, v-bind,
 *   v-on, v-model, v-show, v-html, ...) and their shorthands `:` (v-bind),
 *   `@` (v-on) and `#` (v-slot).
 * - Mustache interpolation {{ expr }} with the inner expression sub-tokenized as
 *   real JS/TS (a string literal containing `}}` does NOT falsely close the
 *   interpolation — the close is scanned respecting quotes).
 * - Directive / binding attribute values (`:foo="…"`, `@click="…"`, `v-if="…"`,
 *   `v-for="… in …"`, `v-slot="{ … }"`, `v-model="…"`) have their EXPRESSION
 *   interior sub-tokenized as JS/TS; the surrounding quotes stay `string`. Plain
 *   static attributes (`class="card"`) keep their value as one tag.attribute.value.
 * - Inside <script>: delegated to the JavaScript/TypeScript tokenizer.
 * - Inside <style>: delegated to the CSS tokenizer.
 *
 * `lang="ts"` anywhere in the SFC's <script> promotes the whole file to TS, so
 * template expressions (mustache + directive values) are tokenized with the TS
 * tokenizer too. Because a line tokenizer reads top-to-bottom and the <template>
 * usually precedes the <script>, the TS flavour only takes effect once the
 * <script lang="ts"> tag has been seen; expressions above it default to JS (the
 * one honest forward-reference limit of a single-pass line tokenizer).
 *
 * Block context, the SFC language, and the active child tokenizer state are
 * threaded via the returned `state` so multi-line <script>/<style> bodies, tags,
 * comments and interpolations resume correctly.
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
	/**
	 * SFC-wide expression language. Set to 'ts' once a `<script lang="ts">` has been
	 * seen; template expressions (mustache + directive values) are sub-tokenized with
	 * the TS tokenizer thereafter. Defaults to 'js'.
	 */
	sfcLang?: 'js' | 'ts';
	/** Child (script/style) tokenizer state */
	innerState?: TokenizerState;
	/** Inside a multi-line HTML comment `<!-- ... -->` opened on a previous line */
	inHtmlComment?: boolean;
	/** Inside a multi-line mustache `{{ ... }}` opened on a previous line */
	inMustache?: boolean;
	/** Inside an open start-tag `<el ...` whose `>` lands on a later line */
	inTag?: boolean;
	/**
	 * Inside an open `<script ...` / `<style ...` opening tag whose `>` lands on a
	 * later line. The accumulated tag text (across lines) is kept so `lang="ts"` /
	 * `scoped` etc. can be detected once the `>` finally arrives.
	 */
	pendingBlock?: 'script' | 'style';
	/** Opening-tag text accumulated so far for a multi-line <script>/<style> tag. */
	pendingBlockText?: string;
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

		// Resume a multi-line <script ...> / <style ...> OPENING tag whose `>` landed
		// on a later line. Parse the attribute region here; once the `>` arrives,
		// detect lang/scoped and switch into the script/style body.
		if (state.pendingBlock) {
			const endIdx = this.indexOfTagEnd(line);
			const block = state.pendingBlock;
			if (endIdx === -1) {
				// Still open — whole line is attribute region; stay in the opening tag.
				tokens.push(...this.tokenizeTagBody(line));
				state.pendingBlockText = (state.pendingBlockText ?? '') + line + '\n';
				return { lineNumber, tokens: reindexTokens(tokens), text: line, state };
			}
			// `>` (or the `/` of `/>`) closes the opening tag on this line.
			const closeLen = line[endIdx] === '/' ? 2 : 1;
			tokens.push(...this.tokenizeTagBody(line.slice(0, endIdx + closeLen)));
			const fullTag = (state.pendingBlockText ?? '') + line.slice(0, endIdx + closeLen);
			state.pendingBlock = undefined;
			state.pendingBlockText = undefined;
			// A self-closing `<script .../>` never opens a body.
			if (line[endIdx] === '/') {
				const rest = line.slice(endIdx + closeLen);
				if (rest) tokens.push(...this.tokenizeTemplate(rest, state));
				return { lineNumber, tokens: reindexTokens(tokens), text: line, state };
			}
			this.enterBlock(block, fullTag, state);
			const rest = line.slice(endIdx + closeLen);
			if (rest) {
				tokens.push(...this.tokenizeLine(rest, lineNumber, state).tokens);
			}
			return { lineNumber, tokens: reindexTokens(tokens), text: line, state };
		}

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

		// Resume a multi-line mustache `{{ ... }}` opened on a previous line. The close
		// is scanned respecting string literals so a `}}` INSIDE a string in the
		// expression does not falsely terminate the interpolation.
		if (state.inMustache) {
			const closeIdx = this.indexOfMustacheClose(line);
			if (closeIdx === -1) {
				// Whole line is still inside the interpolation expression.
				if (line) {
					tokens.push(...this.tokenizeExpression(line, state));
				}
				return tokens;
			}
			const expr = line.slice(0, closeIdx);
			if (expr) {
				tokens.push(...this.tokenizeExpression(expr, state));
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
				tokens.push(...this.tokenizeTagBody(line, state));
				return tokens;
			}
			// Include the closing punctuation (`>` or the `/` of `/>`) so the body
			// parser emits it as tag.punctuation.
			const closeLen = line[endIdx] === '/' ? 2 : 1;
			tokens.push(...this.tokenizeTagBody(line.slice(0, endIdx + closeLen), state));
			state.inTag = false;
			pos = endIdx + closeLen;
		}

		while (pos < line.length) {
			const rest = line.slice(pos);
			const char = line[pos];

			// <script ...> / <style ...> opening tag — switch context after the tag
			// closes. The `>` may land on a LATER line; thread `pendingBlock` so the
			// continuation lines parse as the opening-tag attribute region (and the
			// lang/scoped detection runs once the `>` arrives), instead of bleeding the
			// attributes out as plain template text.
			const blockMatch = rest.match(/^<(script|style)\b/i);
			if (blockMatch) {
				const block = blockMatch[1].toLowerCase() as 'script' | 'style';
				const endIdx = this.indexOfTagEnd(rest);
				if (endIdx === -1) {
					// Opening tag does not close on this line — emit what we have and
					// thread `pendingBlock` for the continuation lines.
					tokens.push(...this.tokenizeTag(rest));
					state.pendingBlock = block;
					state.pendingBlockText = rest + '\n';
					pos = line.length;
					continue;
				}
				const closeLen = rest[endIdx] === '/' ? 2 : 1;
				const tagText = rest.slice(0, endIdx + closeLen);
				tokens.push(...this.tokenizeTag(tagText));
				pos += tagText.length;
				// A self-closing `<script .../>` (rare) never opens a body.
				if (rest[endIdx] !== '/') {
					this.enterBlock(block, tagText, state);
					const inline = line.slice(pos);
					if (inline) {
						tokens.push(...this.tokenizeLine(inline, 0, state).tokens);
						pos = line.length;
					}
				}
				continue;
			}

			// Mustache interpolation: {{ expr }}. The close is scanned respecting string
			// literals so a `}}` inside a string in the expression (e.g.
			// `{{ obj['}}'] }}` or `{{ a + "}}" }}`) does not falsely close it.
			if (char === '{' && line[pos + 1] === '{') {
				const endIdx = this.indexOfMustacheClose(rest.slice(2));
				if (endIdx !== -1) {
					const expr = rest.slice(2, endIdx + 2);
					tokens.push({ type: 'punctuation.brace', text: '{{' });
					if (expr) {
						tokens.push(...this.tokenizeExpression(expr, state));
					}
					tokens.push({ type: 'punctuation.brace', text: '}}' });
					pos += endIdx + 4;
				} else {
					// Unterminated mustache — emit opener + inner expr and thread the
					// open-mustache state so following lines resume as interpolation
					// until the closing `}}`.
					tokens.push({ type: 'punctuation.brace', text: '{{' });
					const expr = rest.slice(2);
					if (expr) {
						tokens.push(...this.tokenizeExpression(expr, state));
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
					tokens.push(...this.tokenizeTag(tag, state));
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

	private tokenizeTag(tag: string, state?: VueTokenizerState): RawToken[] {
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
		tokens.push(...this.tokenizeTagBody(tag.slice(pos), state));
		return tokens;
	}

	/**
	 * Whether a Vue attribute's value is a JS/TS EXPRESSION (and so should be
	 * sub-tokenized) rather than a static string. True for directives (`v-…`) and the
	 * shorthands `:` (v-bind), `@` (v-on), `#` (v-slot). Plain HTML attributes like
	 * `class="card"` keep their value as one static `tag.attribute.value`.
	 */
	private isExpressionAttr(name: string): boolean {
		return /^(v-|[:@#])/.test(name);
	}

	/**
	 * Tokenize the attribute region of a tag (everything after `<name`): whitespace,
	 * attributes/directives with optional `=value`, and the closing `>` / `/>`. This
	 * is split out so an opening tag whose `>` lands on a later line can resume here
	 * line-by-line via the threaded `inTag` / `pendingBlock` state. `state` selects
	 * the JS/TS flavour for sub-tokenized directive/binding expression values.
	 */
	private tokenizeTagBody(body: string, state?: VueTokenizerState): RawToken[] {
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
						const value = valueMatch[0];
						if (this.isExpressionAttr(attrName)) {
							tokens.push(...this.tokenizeAttrExpressionValue(value, state));
						} else {
							tokens.push({ type: 'tag.attribute.value', text: value });
						}
						pos += value.length;
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
	 * Sub-tokenize the value of a directive / binding attribute. When the value is
	 * quoted, the surrounding quotes are emitted as `string` delimiters and the
	 * interior is tokenized as a JS/TS expression (variables, properties, operators,
	 * calls, numbers, …) — the single biggest highlighting lever for templates, since
	 * `@click="count++"`, `:style="{ color: 'red' }"` and `v-for="i in items"` are
	 * real code. An unquoted value (rare) is tokenized directly as an expression.
	 */
	private tokenizeAttrExpressionValue(value: string, state?: VueTokenizerState): RawToken[] {
		const quote = value[0];
		if ((quote === '"' || quote === "'") && value.length >= 2 && value.endsWith(quote)) {
			const inner = value.slice(1, -1);
			const tokens: RawToken[] = [{ type: 'string', text: quote }];
			if (inner) tokens.push(...this.tokenizeExpression(inner, state));
			tokens.push({ type: 'string', text: quote });
			return tokens;
		}
		// Unquoted (or malformed) — tokenize the whole thing as an expression.
		return this.tokenizeExpression(value, state);
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

	/**
	 * Switch into a <script>/<style> body after its opening tag has fully closed.
	 * Detects `lang="ts"` for <script> (which also promotes the SFC-wide expression
	 * language so subsequent template expressions tokenize as TS) and primes the
	 * matching child tokenizer's initial state. `fullTag` is the complete opening-tag
	 * text (possibly accumulated across several lines).
	 */
	private enterBlock(block: 'script' | 'style', fullTag: string, state: VueTokenizerState): void {
		state.context = block;
		if (block === 'script') {
			const isTs = /lang\s*=\s*["']tsx?["']/i.test(fullTag);
			state.scriptLang = isTs ? 'ts' : 'js';
			if (isTs) state.sfcLang = 'ts';
			const child = state.scriptLang === 'ts' ? this.tsTokenizer : this.jsTokenizer;
			state.innerState = child.getInitialState();
		} else {
			state.innerState = this.cssTokenizer.getInitialState();
		}
	}

	/**
	 * Sub-tokenize a Vue template EXPRESSION (mustache interior or a directive /
	 * binding attribute value) as JS or TS, picking the tokenizer from the SFC-wide
	 * language. Using TS in a `lang="ts"` SFC means `as`, type assertions and
	 * built-in type names in template expressions classify correctly.
	 */
	private tokenizeExpression(expression: string, state?: VueTokenizerState): RawToken[] {
		const child = state?.sfcLang === 'ts' ? this.tsTokenizer : this.jsTokenizer;
		const result = child.tokenizeLine(expression, 1, child.getInitialState());
		return result.tokens;
	}

	/**
	 * Find the index of the `}}` that closes a mustache interpolation, scanning the
	 * expression interior and SKIPPING over `}}` that sits inside a string literal
	 * (single, double or backtick quotes, honouring `\` escapes). Returns the index
	 * of the first `}` of the closing `}}`, or -1 if it does not close on this line.
	 *
	 * Without this, a naive `indexOf('}}')` mis-closes on e.g. `{{ obj['}}'] }}` or
	 * `{{ a + "}}" }}`, bleeding the real tail out as plain text.
	 */
	private indexOfMustacheClose(expr: string): number {
		let quote: string | null = null;
		for (let i = 0; i < expr.length; i++) {
			const ch = expr[i];
			if (quote) {
				if (ch === '\\') {
					i++; // skip the escaped char
					continue;
				}
				if (ch === quote) quote = null;
				continue;
			}
			if (ch === '"' || ch === "'" || ch === '`') {
				quote = ch;
				continue;
			}
			if (ch === '}' && expr[i + 1] === '}') {
				return i;
			}
		}
		return -1;
	}
}

/**
 * Create a Vue tokenizer.
 */
export function createVueTokenizer(): LanguageTokenizer {
	return new VueTokenizer();
}
