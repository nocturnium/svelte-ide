/**
 * Base tokenizer with common functionality
 */

import type { Token, TokenizedLine, TokenizerState, TokenType, LanguageGrammar, LanguageTokenizer } from './types';

/**
 * Create a token
 */
export function createToken(type: TokenType, text: string, start: number): Token {
	return {
		type,
		text,
		start,
		end: start + text.length
	};
}

/**
 * Base tokenizer class using grammar rules
 */
export class GrammarTokenizer implements LanguageTokenizer {
	language: string;
	private grammar: LanguageGrammar;

	constructor(grammar: LanguageGrammar) {
		this.language = grammar.language;
		this.grammar = grammar;
	}

	getInitialState(): TokenizerState {
		return {};
	}

	tokenizeLine(line: string, lineNumber: number, prevState?: TokenizerState): TokenizedLine {
		const tokens: Token[] = [];
		let pos = 0;
		const state: TokenizerState = { ...prevState };
		let currentRuleSet = 'root';

		// Determine starting rule set based on state
		if (state.inBlockComment) {
			currentRuleSet = 'blockComment';
		} else if (state.inTemplateLiteral) {
			currentRuleSet = 'templateLiteral';
		} else if (state.inMultilineString) {
			currentRuleSet = 'multilineString';
		}

		while (pos < line.length) {
			const remaining = line.slice(pos);
			let matched = false;

			// Try to match rules in current rule set
			const rules = this.grammar.rules[currentRuleSet] || this.grammar.rules['root'] || [];

			for (const rule of rules) {
				const match = remaining.match(rule.pattern);
				if (match && match.index === 0) {
					const text = match[0];
					tokens.push(createToken(rule.type, text, pos));
					pos += text.length;
					matched = true;

					// Handle state transitions
					if (rule.nextState) {
						currentRuleSet = rule.nextState;
						this.updateState(state, rule.nextState, true);
					}
					if (rule.popState) {
						currentRuleSet = 'root';
						this.updateState(state, currentRuleSet, false);
					}

					break;
				}
			}

			// No match - consume single character as text
			if (!matched) {
				const char = line[pos];
				// Try to merge with previous text token
				const lastToken = tokens[tokens.length - 1];
				if (lastToken && lastToken.type === 'text' && lastToken.end === pos) {
					lastToken.text += char;
					lastToken.end += 1;
				} else {
					tokens.push(createToken('text', char, pos));
				}
				pos += 1;
			}
		}

		// Handle empty lines
		if (tokens.length === 0) {
			tokens.push(createToken('text', '', 0));
		}

		return {
			lineNumber,
			tokens,
			text: line,
			state: { ...state }
		};
	}

	private updateState(state: TokenizerState, ruleSet: string, entering: boolean): void {
		switch (ruleSet) {
			case 'blockComment':
				state.inBlockComment = entering;
				break;
			case 'templateLiteral':
				state.inTemplateLiteral = entering;
				break;
			case 'multilineString':
				state.inMultilineString = entering;
				break;
		}
	}
}

/**
 * Simple regex-based tokenizer for basic languages
 */
export class SimpleTokenizer implements LanguageTokenizer {
	language: string;
	private patterns: Array<{ type: TokenType; regex: RegExp }>;

	constructor(language: string, patterns: Array<{ type: TokenType; regex: RegExp }>) {
		this.language = language;
		this.patterns = patterns;
	}

	getInitialState(): TokenizerState {
		return {};
	}

	tokenizeLine(line: string, lineNumber: number, prevState?: TokenizerState): TokenizedLine {
		const tokens: Token[] = [];
		let pos = 0;
		const state: TokenizerState = { ...prevState };

		// Handle block comment continuation
		if (state.inBlockComment) {
			const endMatch = line.indexOf('*/');
			if (endMatch !== -1) {
				tokens.push(createToken('comment.block', line.slice(0, endMatch + 2), 0));
				pos = endMatch + 2;
				state.inBlockComment = false;
			} else {
				tokens.push(createToken('comment.block', line, 0));
				return { lineNumber, tokens, text: line, state };
			}
		}

		while (pos < line.length) {
			const remaining = line.slice(pos);
			let matched = false;

			// Check for block comment start
			if (remaining.startsWith('/*')) {
				const endMatch = remaining.indexOf('*/', 2);
				if (endMatch !== -1) {
					const text = remaining.slice(0, endMatch + 2);
					tokens.push(createToken('comment.block', text, pos));
					pos += text.length;
				} else {
					tokens.push(createToken('comment.block', remaining, pos));
					state.inBlockComment = true;
					pos = line.length;
				}
				matched = true;
				continue;
			}

			// Try each pattern
			for (const { type, regex } of this.patterns) {
				const match = remaining.match(regex);
				if (match && match.index === 0) {
					const text = match[0];
					tokens.push(createToken(type, text, pos));
					pos += text.length;
					matched = true;
					break;
				}
			}

			// No match - consume character
			if (!matched) {
				const char = remaining[0];
				const lastToken = tokens[tokens.length - 1];
				if (lastToken && lastToken.type === 'text' && lastToken.end === pos) {
					lastToken.text += char;
					lastToken.end += 1;
				} else {
					tokens.push(createToken('text', char, pos));
				}
				pos += 1;
			}
		}

		if (tokens.length === 0) {
			tokens.push(createToken('text', '', 0));
		}

		return { lineNumber, tokens, text: line, state };
	}
}

/**
 * Plaintext tokenizer - no highlighting
 */
export class PlaintextTokenizer implements LanguageTokenizer {
	language = 'plaintext';

	getInitialState(): TokenizerState {
		return {};
	}

	tokenizeLine(line: string, lineNumber: number): TokenizedLine {
		return {
			lineNumber,
			tokens: [createToken('text', line, 0)],
			text: line,
			state: {}
		};
	}
}
