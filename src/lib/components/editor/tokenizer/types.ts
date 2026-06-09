/**
 * Token types for syntax highlighting
 */

export type TokenType =
	// Comments
	| 'comment'
	| 'comment.line'
	| 'comment.block'
	| 'comment.doc'
	// Strings
	| 'string'
	| 'string.template'
	| 'string.regex'
	| 'string.escape'
	// Numbers
	| 'number'
	| 'number.integer'
	| 'number.float'
	| 'number.hex'
	| 'number.binary'
	// Keywords
	| 'keyword'
	| 'keyword.control'
	| 'keyword.operator'
	| 'keyword.definition'
	| 'keyword.module'
	| 'keyword.storage'
	// Operators
	| 'operator'
	| 'operator.arithmetic'
	| 'operator.comparison'
	| 'operator.logical'
	| 'operator.assignment'
	// Names/Identifiers
	| 'variable'
	| 'variable.definition'
	| 'variable.parameter'
	| 'function'
	| 'function.definition'
	| 'function.call'
	| 'property'
	| 'property.definition'
	// Types
	| 'type'
	| 'type.class'
	| 'type.interface'
	| 'type.namespace'
	| 'type.builtin'
	// Constants
	| 'constant'
	| 'constant.boolean'
	| 'constant.null'
	| 'constant.builtin'
	// Punctuation
	| 'punctuation'
	| 'punctuation.bracket'
	| 'punctuation.brace'
	| 'punctuation.paren'
	| 'punctuation.separator'
	| 'punctuation.accessor'
	// Markup (HTML/XML)
	| 'tag'
	| 'tag.name'
	| 'tag.attribute'
	| 'tag.attribute.value'
	| 'tag.punctuation'
	// Markdown
	| 'markup.heading'
	| 'markup.bold'
	| 'markup.italic'
	| 'markup.link'
	| 'markup.code'
	| 'markup.quote'
	| 'markup.list'
	// Special
	| 'invalid'
	| 'text';

/**
 * A single token in the tokenized output
 */
export interface Token {
	/** Token type for styling */
	type: TokenType;
	/** The actual text content */
	text: string;
	/** Starting position in the line */
	start: number;
	/** Ending position in the line */
	end: number;
}

/**
 * A tokenized line
 */
export interface TokenizedLine {
	/** Line number (1-based) */
	lineNumber: number;
	/** Array of tokens in the line */
	tokens: Token[];
	/** Raw text of the line */
	text: string;
	/** State to carry forward to next line (for multi-line constructs) */
	state?: TokenizerState;
}

/**
 * State carried between lines for multi-line constructs
 */
export interface TokenizerState {
	/** Currently in a multi-line comment */
	inBlockComment?: boolean;
	/** Currently in a template literal */
	inTemplateLiteral?: boolean;
	/** Currently in a multi-line string */
	inMultilineString?: boolean;
	/** String delimiter if in string */
	stringDelimiter?: string;
	/** Nesting depth for template literals */
	templateDepth?: number;
	/** Custom state data */
	custom?: Record<string, unknown>;
}

/**
 * Language tokenizer interface
 */
export interface LanguageTokenizer {
	/** Language identifier */
	language: string;
	/** Tokenize a single line */
	tokenizeLine(line: string, lineNumber: number, state?: TokenizerState): TokenizedLine;
	/** Get initial state */
	getInitialState(): TokenizerState;
}
