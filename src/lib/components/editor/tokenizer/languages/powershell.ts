/**
 * PowerShell tokenizer
 */

import type { Token, TokenizedLine, TokenizerState, TokenType } from '../types';
import { createToken } from '../base';

// PowerShell keywords are case-insensitive; matched against the lowercased word.
const controlKeywords = new Set([
	'if',
	'elseif',
	'else',
	'switch',
	'for',
	'foreach',
	'while',
	'do',
	'until',
	'break',
	'continue',
	'return',
	'throw',
	'try',
	'catch',
	'finally',
	'trap'
]);

const definitionKeywords = new Set(['function', 'filter', 'class', 'enum']);

const otherKeywords = new Set(['param', 'begin', 'process', 'end', 'in', 'data', 'dynamicparam']);

// Named operators / type operators spelled with a leading hyphen.
const namedOperators = new Set([
	'eq',
	'ne',
	'gt',
	'lt',
	'ge',
	'le',
	'match',
	'notmatch',
	'like',
	'notlike',
	'contains',
	'notcontains',
	'in',
	'notin',
	'and',
	'or',
	'not',
	'xor',
	'band',
	'bor',
	'bnot',
	'bxor',
	'join',
	'split',
	'replace',
	'is',
	'isnot',
	'as',
	'ceq',
	'cne',
	'cgt',
	'clt',
	'cge',
	'cle',
	'cmatch',
	'clike',
	'icontains',
	'shl',
	'shr',
	'f'
]);

// Automatic variables that carry special meaning.
const booleanVariables = new Set(['true', 'false']);

interface PowerShellTokenizerState extends TokenizerState {
	/** Inside a <# ... #> block comment */
	inBlockComment?: boolean;
	/** Inside an expandable here-string @" ... "@ */
	inHereStringDouble?: boolean;
	/** Inside a literal here-string @' ... '@ */
	inHereStringSingle?: boolean;
}

export class PowerShellTokenizer {
	language = 'powershell';

	getInitialState(): PowerShellTokenizerState {
		return {};
	}

	tokenizeLine(
		line: string,
		lineNumber: number,
		prevState?: PowerShellTokenizerState
	): TokenizedLine {
		const tokens: Token[] = [];
		let pos = 0;
		const state: PowerShellTokenizerState = { ...prevState };

		// Resume a block comment from a previous line.
		if (state.inBlockComment) {
			const endIdx = line.indexOf('#>');
			if (endIdx !== -1) {
				tokens.push(createToken('comment.block', line.slice(0, endIdx + 2), 0));
				pos = endIdx + 2;
				state.inBlockComment = false;
			} else {
				tokens.push(createToken('comment.block', line, 0));
				return { lineNumber, tokens, text: line, state };
			}
		}

		// Resume an expandable here-string. The closing "@ must be at the very
		// start of the line (PowerShell requires the terminator in column 0).
		if (state.inHereStringDouble) {
			if (/^"@/.test(line)) {
				tokens.push(createToken('string.template', '"@', 0));
				pos = 2;
				state.inHereStringDouble = false;
			} else {
				if (line.length > 0) {
					tokens.push(createToken('string.template', line, 0));
				} else {
					tokens.push(createToken('string.template', '', 0));
				}
				return { lineNumber, tokens, text: line, state };
			}
		}

		// Resume a literal here-string.
		if (state.inHereStringSingle) {
			if (/^'@/.test(line)) {
				tokens.push(createToken('string', "'@", 0));
				pos = 2;
				state.inHereStringSingle = false;
			} else {
				if (line.length > 0) {
					tokens.push(createToken('string', line, 0));
				} else {
					tokens.push(createToken('string', '', 0));
				}
				return { lineNumber, tokens, text: line, state };
			}
		}

		while (pos < line.length) {
			const remaining = line.slice(pos);
			const token = this.getNextToken(remaining, pos, state);

			if (token) {
				tokens.push(token);
				pos = token.end;
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

	private getNextToken(text: string, pos: number, state: PowerShellTokenizerState): Token | null {
		// Whitespace
		const wsMatch = text.match(/^[ \t]+/);
		if (wsMatch) {
			return createToken('text', wsMatch[0], pos);
		}

		// Block comments <# ... #>
		if (text.startsWith('<#')) {
			const endIdx = text.indexOf('#>', 2);
			if (endIdx !== -1) {
				return createToken('comment.block', text.slice(0, endIdx + 2), pos);
			}
			state.inBlockComment = true;
			return createToken('comment.block', text, pos);
		}

		// Line comments. A '#' only opens a comment at a token boundary; bare '#'
		// elsewhere is rare, but '#' following an identifier char (e.g. inside a
		// variable name) is handled before we get here.
		if (text.startsWith('#')) {
			return createToken('comment.line', text, pos);
		}

		// Here-strings must be checked before plain strings.
		// Expandable here-string opener: @" then end of line.
		if (/^@"\s*$/.test(text)) {
			state.inHereStringDouble = true;
			return createToken('string.template', text, pos);
		}
		// Literal here-string opener: @' then end of line.
		if (/^@'\s*$/.test(text)) {
			state.inHereStringSingle = true;
			return createToken('string', text, pos);
		}

		// Double-quoted (expandable) string with interpolation.
		if (text.startsWith('"')) {
			return this.tokenizeDoubleString(text, pos);
		}

		// Single-quoted (literal) string.
		if (text.startsWith("'")) {
			return this.tokenizeSingleString(text, pos);
		}

		// Variables: $name, ${name}, $_, $$, $?, $^
		if (text.startsWith('$')) {
			return this.tokenizeVariable(text, pos);
		}

		// Numbers: hex, decimal/float with optional KB/MB/GB/TB/PB suffix.
		const numMatch = text.match(
			/^(?:0[xX][0-9a-fA-F]+|(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)(?:[kKmMgGtTpP][bB])?/
		);
		if (numMatch) {
			return createToken('number', numMatch[0], pos);
		}

		// Named operators and parameters: -eq, -match, -ParameterName
		if (text.startsWith('-')) {
			const dashWord = text.match(/^-[a-zA-Z][a-zA-Z0-9]*/);
			if (dashWord) {
				const word = dashWord[0].slice(1).toLowerCase();
				if (namedOperators.has(word)) {
					return createToken('operator.logical', dashWord[0], pos);
				}
				return createToken('variable.parameter', dashWord[0], pos);
			}
		}

		// Identifiers / cmdlets / keywords.
		const identMatch = text.match(/^[a-zA-Z_][a-zA-Z0-9_]*(?:-[a-zA-Z_][a-zA-Z0-9_]*)*/);
		if (identMatch) {
			const word = identMatch[0];
			return createToken(this.classifyIdentifier(word, text, word.length), word, pos);
		}

		// Operators (symbolic). Pipeline | and redirection > >> handled here too.
		const opMatch = text.match(
			/^(?:\+\+|--|\*=|\/=|%=|\+=|-=|>>|::|\|\||&&|[-+*/%](?![a-zA-Z])|[=<>!]=?|[|&])/
		);
		if (opMatch) {
			const op = opMatch[0];
			let type: TokenType = 'operator';
			if (op === '=' || op.endsWith('=')) {
				if (op === '==' || op === '!=' || op === '<=' || op === '>=') {
					type = 'operator.comparison';
				} else {
					type = 'operator.assignment';
				}
			} else if (op === '|' || op === '&' || op === '||' || op === '&&') {
				type = 'operator.logical';
			} else if (op === '>>') {
				type = 'operator';
			} else {
				type = 'operator.arithmetic';
			}
			return createToken(type, op, pos);
		}

		// Punctuation
		const punctMatch = text.match(/^[{}[\](),.;@]/);
		if (punctMatch) {
			const char = punctMatch[0];
			let type: TokenType = 'punctuation';
			if (char === '{' || char === '}') type = 'punctuation.brace';
			else if (char === '[' || char === ']') type = 'punctuation.bracket';
			else if (char === '(' || char === ')') type = 'punctuation.paren';
			else if (char === ',' || char === ';') type = 'punctuation.separator';
			else if (char === '.') type = 'punctuation.accessor';
			return createToken(type, char, pos);
		}

		return createToken('text', text[0], pos);
	}

	private classifyIdentifier(word: string, context: string, wordLength: number): TokenType {
		const lower = word.toLowerCase();

		// Keywords (case-insensitive).
		if (controlKeywords.has(lower)) return 'keyword.control';
		if (definitionKeywords.has(lower)) return 'keyword.definition';
		if (otherKeywords.has(lower)) return 'keyword';

		// Cmdlets follow the Verb-Noun pattern (Get-ChildItem, Write-Host).
		if (/^[A-Za-z]+-[A-Za-z][A-Za-z0-9]*$/.test(word)) {
			return 'function.call';
		}

		// A bare identifier immediately followed by '(' is a function call.
		const afterWord = context.slice(wordLength).trim();
		if (afterWord.startsWith('(')) {
			return 'function.call';
		}

		return 'variable';
	}

	private tokenizeVariable(text: string, pos: number): Token {
		// Braced variable: ${name} or ${env:PATH}
		if (text.startsWith('${')) {
			const endIdx = text.indexOf('}', 2);
			if (endIdx !== -1) {
				const raw = text.slice(0, endIdx + 1);
				return createToken('variable', raw, pos);
			}
			// Unterminated — fall through to single char to stay lossless.
			return createToken('variable', '$', pos);
		}

		// Special single-char automatic variables: $_, $$, $?, $^
		const specialMatch = text.match(/^\$[_$?^]/);
		if (specialMatch) {
			return createToken('variable', specialMatch[0], pos);
		}

		// Scoped or plain variable: $global:foo, $script:bar, $PSItem, $true
		const varMatch = text.match(/^\$(?:[a-zA-Z_][a-zA-Z0-9_]*:)?[a-zA-Z_][a-zA-Z0-9_]*/);
		if (varMatch) {
			const raw = varMatch[0];
			// Determine the trailing name segment for constant classification.
			const colonIdx = raw.indexOf(':');
			const name = (colonIdx !== -1 ? raw.slice(colonIdx + 1) : raw.slice(1)).toLowerCase();
			if (booleanVariables.has(name)) {
				return createToken('constant.boolean', raw, pos);
			}
			if (name === 'null') {
				return createToken('constant.null', raw, pos);
			}
			return createToken('variable', raw, pos);
		}

		// Lone '$' — emit as text-ish variable to remain lossless.
		return createToken('variable', '$', pos);
	}

	private tokenizeDoubleString(text: string, pos: number): Token {
		// Expandable string: highlight as string.template since it may interpolate.
		let i = 1;
		while (i < text.length) {
			const ch = text[i];
			if (ch === '`' && i + 1 < text.length) {
				// PowerShell escape character (backtick).
				i += 2;
				continue;
			}
			if (ch === '"') {
				// Doubled "" is an escaped quote inside the string.
				if (text[i + 1] === '"') {
					i += 2;
					continue;
				}
				return createToken('string.template', text.slice(0, i + 1), pos);
			}
			i++;
		}
		// Unterminated on this line — emit what we have (no multi-line non-here strings).
		return createToken('string.template', text.slice(0, i), pos);
	}

	private tokenizeSingleString(text: string, pos: number): Token {
		let i = 1;
		while (i < text.length) {
			if (text[i] === "'") {
				// Doubled '' is an escaped quote inside a literal string.
				if (text[i + 1] === "'") {
					i += 2;
					continue;
				}
				return createToken('string', text.slice(0, i + 1), pos);
			}
			i++;
		}
		return createToken('string', text.slice(0, i), pos);
	}
}

export function createPowerShellTokenizer(): PowerShellTokenizer {
	return new PowerShellTokenizer();
}
