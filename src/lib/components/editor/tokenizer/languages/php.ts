/**
 * PHP tokenizer
 */

import type { Token, TokenizedLine, TokenizerState, TokenType } from '../types';
import { createToken } from '../base';

// Definition keywords (function/class/interface/trait/enum)
const definitionKeywords = new Set(['function', 'fn', 'class', 'interface', 'trait', 'enum']);

// Storage / modifier keywords
const storageKeywords = new Set([
	'public',
	'private',
	'protected',
	'static',
	'final',
	'abstract',
	'const',
	'readonly',
	'var',
	'global'
]);

// Control-flow keywords
const controlKeywords = new Set([
	'if',
	'elseif',
	'else',
	'switch',
	'case',
	'default',
	'for',
	'foreach',
	'while',
	'do',
	'break',
	'continue',
	'return',
	'throw',
	'try',
	'catch',
	'finally',
	'match',
	'goto',
	'yield'
]);

// Module / namespace keywords
const moduleKeywords = new Set([
	'use',
	'require',
	'require_once',
	'include',
	'include_once',
	'namespace'
]);

// Other plain keywords
const keywords = new Set([
	'new',
	'echo',
	'print',
	'this',
	'self',
	'parent',
	'extends',
	'implements',
	'instanceof',
	'as',
	'clone',
	'and',
	'or',
	'xor',
	'list',
	'array',
	'isset',
	'unset',
	'empty',
	'declare',
	'endif',
	'endfor',
	'endforeach',
	'endwhile',
	'endswitch',
	'insteadof',
	'callable'
]);

// Boolean / null constants (case-insensitive in PHP)
const booleanWords = new Set(['true', 'false']);
const nullWords = new Set(['null']);

// Builtin type hints
const builtinTypes = new Set([
	'int',
	'float',
	'string',
	'bool',
	'object',
	'mixed',
	'void',
	'iterable',
	'never',
	'false',
	'true',
	'null',
	'self',
	'static',
	'parent'
]);

interface PhpTokenizerState extends TokenizerState {
	/** Currently inside a heredoc/nowdoc block */
	inHeredoc?: boolean;
	/** The closing label of the active heredoc/nowdoc */
	heredocLabel?: string;
	/** Whether the active doc block is a nowdoc (single-quoted label, no interpolation) */
	heredocNowdoc?: boolean;
	/** Whether the active multi-line block comment was opened as a /** doc comment */
	inDocComment?: boolean;
}

export class PhpTokenizer {
	language = 'php';

	getInitialState(): PhpTokenizerState {
		return {};
	}

	tokenizeLine(line: string, lineNumber: number, prevState?: PhpTokenizerState): TokenizedLine {
		const tokens: Token[] = [];
		let pos = 0;
		const state: PhpTokenizerState = { ...prevState };

		// Handle heredoc/nowdoc continuation
		if (state.inHeredoc) {
			// The closing label may be indented (PHP 7.3+) and optionally followed by ; or ,
			const label = state.heredocLabel ?? '';
			const closeMatch = line.match(new RegExp(`^(\\s*)(${escapeRegex(label)})\\b`));
			if (closeMatch) {
				const indent = closeMatch[1];
				if (indent.length > 0) {
					tokens.push(createToken('text', indent, 0));
				}
				tokens.push(createToken('string', label, indent.length));
				pos = indent.length + label.length;
				state.inHeredoc = false;
				state.heredocLabel = undefined;
				state.heredocNowdoc = undefined;
				// Continue scanning the rest of the line (e.g. a trailing ;)
			} else {
				// Still inside the body
				tokens.push(createToken('string', line, 0));
				return { lineNumber, tokens, text: line, state };
			}
		}

		// Handle block comment continuation (preserve doc-comment vs block-comment type)
		if (state.inBlockComment) {
			const commentType: TokenType = state.inDocComment ? 'comment.doc' : 'comment.block';
			const endIdx = line.indexOf('*/');
			if (endIdx !== -1) {
				tokens.push(createToken(commentType, line.slice(0, endIdx + 2), 0));
				pos = endIdx + 2;
				state.inBlockComment = false;
				state.inDocComment = undefined;
			} else {
				tokens.push(createToken(commentType, line, 0));
				return { lineNumber, tokens, text: line, state };
			}
		}

		while (pos < line.length) {
			const remaining = line.slice(pos);
			const token = this.getNextToken(remaining, pos, state);

			if (token) {
				tokens.push(token);
				pos = token.end;
				// A heredoc opener consumes the rest of the line into state; stop scanning.
				if (state.inHeredoc) {
					break;
				}
			} else {
				tokens.push(createToken('text', remaining[0], pos));
				pos += 1;
			}
		}

		if (tokens.length === 0) {
			tokens.push(createToken('text', '', 0));
		}

		return { lineNumber, tokens, text: line, state };
	}

	private getNextToken(text: string, pos: number, state: PhpTokenizerState): Token | null {
		// Whitespace
		const wsMatch = text.match(/^[ \t]+/);
		if (wsMatch) {
			return createToken('text', wsMatch[0], pos);
		}

		// PHP open/close tags
		if (text.startsWith('<?php')) {
			return createToken('keyword', '<?php', pos);
		}
		if (text.startsWith('<?=')) {
			return createToken('keyword', '<?=', pos);
		}
		if (text.startsWith('<?')) {
			return createToken('keyword', '<?', pos);
		}
		if (text.startsWith('?>')) {
			return createToken('keyword', '?>', pos);
		}

		// Heredoc / nowdoc opener: <<<LABEL or <<<"LABEL" or <<<'LABEL'
		const heredocMatch = text.match(/^<<<[ \t]*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1/);
		if (heredocMatch) {
			const quote = heredocMatch[1];
			state.inHeredoc = true;
			state.heredocLabel = heredocMatch[2];
			state.heredocNowdoc = quote === "'";
			// Consume the rest of the line as the opener token (body begins next line).
			return createToken('string', text, pos);
		}

		// Doc comment /** ... */
		// Note: `/**/` is an empty *block* comment, not a doc comment opener.
		if (text.startsWith('/**') && !text.startsWith('/**/')) {
			const endIdx = text.indexOf('*/', 3);
			if (endIdx !== -1) {
				return createToken('comment.doc', text.slice(0, endIdx + 2), pos);
			}
			state.inBlockComment = true;
			state.inDocComment = true;
			return createToken('comment.doc', text, pos);
		}

		// Block comment /* ... */
		if (text.startsWith('/*')) {
			const endIdx = text.indexOf('*/', 2);
			if (endIdx !== -1) {
				return createToken('comment.block', text.slice(0, endIdx + 2), pos);
			}
			state.inBlockComment = true;
			return createToken('comment.block', text, pos);
		}

		// Line comments: // and #  (# is not the start of #[Attribute])
		if (text.startsWith('//')) {
			return createToken('comment.line', text, pos);
		}
		if (text.startsWith('#') && !text.startsWith('#[')) {
			return createToken('comment.line', text, pos);
		}

		// Attributes #[...]
		if (text.startsWith('#[')) {
			return createToken('punctuation', '#[', pos);
		}

		// Variables: $name
		const varMatch = text.match(/^\$[a-zA-Z_\x80-\xff][a-zA-Z0-9_\x80-\xff]*/);
		if (varMatch) {
			return createToken('variable', varMatch[0], pos);
		}

		// Single-quoted string (literal, no interpolation)
		if (text.startsWith("'")) {
			return this.tokenizeString(text, pos, "'");
		}

		// Double-quoted string (interpolated)
		if (text.startsWith('"')) {
			return this.tokenizeString(text, pos, '"');
		}

		// Numbers
		const numMatch = text.match(
			/^(?:0[xX][0-9a-fA-F_]+|0[bB][01_]+|0[oO][0-7_]+|0[0-7_]+(?![.eE])|(?:\d[\d_]*\.?[\d_]*|\.\d[\d_]*)(?:[eE][+-]?\d[\d_]*)?)/
		);
		if (numMatch) {
			return createToken('number', numMatch[0], pos);
		}

		// Identifiers and keywords
		const identMatch = text.match(/^[a-zA-Z_\x80-\xff][a-zA-Z0-9_\x80-\xff]*/);
		if (identMatch) {
			const word = identMatch[0];
			return createToken(this.classifyIdentifier(word, text, word.length), word, pos);
		}

		// Operators (multi-char first)
		const opMatch = text.match(
			/^(?:\?->|<=>|===|!==|<<=|>>=|\*\*=|\?\?=|\.\.\.|->|::|=>|\?\?|&&|\|\||<<|>>|\*\*|\+\+|--|==|!=|<>|<=|>=|[+\-*/%.&|^]=|[+\-*/%.=<>!&|^~@?:])/
		);
		if (opMatch) {
			return createToken(this.classifyOperator(opMatch[0]), opMatch[0], pos);
		}

		// Punctuation
		const punctMatch = text.match(/^[{}[\](),;\\]/);
		if (punctMatch) {
			const char = punctMatch[0];
			let type: TokenType = 'punctuation';
			if (char === '{' || char === '}') type = 'punctuation.brace';
			else if (char === '[' || char === ']') type = 'punctuation.bracket';
			else if (char === '(' || char === ')') type = 'punctuation.paren';
			else if (char === ',' || char === ';') type = 'punctuation.separator';
			else if (char === '\\') type = 'punctuation.accessor';
			return createToken(type, char, pos);
		}

		return createToken('text', text[0], pos);
	}

	private classifyOperator(op: string): TokenType {
		if (op === '->' || op === '?->' || op === '::') return 'punctuation.accessor';
		if (op === '=>') return 'operator';
		if (
			op === '=' ||
			op === '+=' ||
			op === '-=' ||
			op === '*=' ||
			op === '/=' ||
			op === '%=' ||
			op === '.=' ||
			op === '**=' ||
			op === '??=' ||
			op === '<<=' ||
			op === '>>=' ||
			op === '&=' ||
			op === '|=' ||
			op === '^='
		) {
			return 'operator.assignment';
		}
		if (
			op === '==' ||
			op === '===' ||
			op === '!=' ||
			op === '!==' ||
			op === '<>' ||
			op === '<' ||
			op === '>' ||
			op === '<=' ||
			op === '>=' ||
			op === '<=>'
		) {
			return 'operator.comparison';
		}
		if (op === '&&' || op === '||' || op === '!') return 'operator.logical';
		if (
			op === '+' ||
			op === '-' ||
			op === '*' ||
			op === '/' ||
			op === '%' ||
			op === '**' ||
			op === '++' ||
			op === '--'
		) {
			return 'operator.arithmetic';
		}
		return 'operator';
	}

	private classifyIdentifier(word: string, context: string, wordLength: number): TokenType {
		const lower = word.toLowerCase();

		// Boolean / null constants (case-insensitive)
		if (booleanWords.has(lower)) return 'constant.boolean';
		if (nullWords.has(lower)) return 'constant.null';

		// Definition keywords
		if (definitionKeywords.has(lower)) return 'keyword.definition';

		// Storage keywords
		if (storageKeywords.has(lower)) return 'keyword.storage';

		// Control-flow keywords
		if (controlKeywords.has(lower)) return 'keyword.control';

		// Module / namespace keywords
		if (moduleKeywords.has(lower)) return 'keyword.module';

		// Other plain keywords
		if (keywords.has(lower)) return 'keyword';

		// Constant lookup directly after :: accessor (Class::CONSTANT) when ALL_CAPS
		// handled below via UPPER heuristic.

		// Function call: identifier immediately followed by (
		const afterWord = context.slice(wordLength).trim();
		if (afterWord.startsWith('(')) {
			return 'function.call';
		}

		// Builtin type hints
		if (builtinTypes.has(lower)) {
			return 'type.builtin';
		}

		// ALL_CAPS => constant
		if (/^[A-Z][A-Z0-9_]*$/.test(word) && word.length > 1) {
			return 'constant';
		}

		// PascalCase => class/type name
		if (/^[A-Z][a-zA-Z0-9_]*$/.test(word)) {
			return 'type.class';
		}

		return 'variable';
	}

	private tokenizeString(text: string, pos: number, delimiter: string): Token {
		// Double-quoted strings interpolate $vars and {$expr}; treat as string.template
		// when they contain interpolation, otherwise plain string. We emit the whole
		// literal as a single token (best-effort, lossless) with the right type.
		let i = 1;
		let interpolated = false;
		while (i < text.length) {
			const ch = text[i];
			if (ch === '\\' && i + 1 < text.length) {
				i += 2;
				continue;
			}
			if (ch === delimiter) {
				const type: TokenType = delimiter === '"' && interpolated ? 'string.template' : 'string';
				return createToken(type, text.slice(0, i + 1), pos);
			}
			if (delimiter === '"' && (ch === '$' || (ch === '{' && text[i + 1] === '$'))) {
				interpolated = true;
			}
			i++;
		}
		// Unterminated on this line: PHP strings can span lines. Emit what we have.
		const type: TokenType = delimiter === '"' && interpolated ? 'string.template' : 'string';
		return createToken(type, text.slice(0, i), pos);
	}
}

function escapeRegex(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function createPhpTokenizer() {
	return new PhpTokenizer();
}
