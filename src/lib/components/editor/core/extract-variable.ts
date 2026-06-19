import { resolveLanguage, tokenize } from '../tokenizer';
import type { Token } from '../tokenizer';
import type { EditorState, Position } from './state';

export type ExtractVariablePlan = {
	ok: true;
	/** Name of the hoisted constant (always `extracted` in this build). */
	varName: string;
	/** Full text of the new `const` line, including the statement's indentation. */
	declarationLine: string;
	/** 0-based line the declaration is inserted ABOVE (the selection's line). */
	insertLine: number;
	/** The trimmed selection range to overwrite with {@link varName}. */
	replaceRange: { start: Position; end: Position };
};

export type ExtractVariableRefusal = { ok: false; reason: string };

export type ExtractVariableResult = { ok: true } | ExtractVariableRefusal;

type PlanInput = {
	lines: readonly { text: string }[];
	language: string;
	selection: { start: Position; end: Position };
};

const SUPPORTED_LANGUAGES = new Set(['javascript', 'typescript', 'jsx', 'tsx']);
const VAR_NAME = 'extracted';
const IDENTIFIER_TYPES = new Set(['variable', 'function.call', 'type.class']);

// Keywords whose presence (at the selection's top nesting level) means the
// selection is a statement, not a value expression. `new`/`typeof`/`instanceof`/
// `in`/`of`/`void`/`delete`/`as` are deliberately ABSENT — they are valid inside
// an expression. `function`/`class` ARE refused: a function/class expression is
// valid JS but introduces a body we don't want to hoist blindly in this build.
const STATEMENT_KEYWORDS = new Set([
	'const',
	'let',
	'var',
	'function',
	'class',
	'return',
	'if',
	'else',
	'for',
	'while',
	'do',
	'switch',
	'case',
	'default',
	'break',
	'continue',
	'throw',
	'try',
	'catch',
	'finally',
	'import',
	'export',
	'with',
	'debugger'
]);

const ASSIGNMENT_OPERATORS = new Set([
	'=',
	'+=',
	'-=',
	'*=',
	'/=',
	'%=',
	'**=',
	'&=',
	'|=',
	'^=',
	'&&=',
	'||=',
	'??=',
	'<<=',
	'>>=',
	'>>>='
]);

/**
 * Plan the extraction of a selected expression into a hoisted `const`. PURE: no
 * editor mutation. Returns a refusal (with a human reason) whenever the selection
 * is anything other than a single, complete, single-line value expression — the
 * safe-or-refuse contract. The token heuristics here are the runtime gate; the
 * unit suite additionally parses every accepted result with acorn to prove the
 * rewrite is valid JS (the parser oracle is test-only, never shipped).
 */
export function planExtractVariable(
	input: PlanInput
): ExtractVariablePlan | ExtractVariableRefusal {
	try {
		return planExtractVariableUnsafe(input);
	} catch {
		return { ok: false, reason: 'Could not safely analyze the selected expression.' };
	}
}

function planExtractVariableUnsafe(input: PlanInput): ExtractVariablePlan | ExtractVariableRefusal {
	const language = resolveLanguage(input.language);
	if (!SUPPORTED_LANGUAGES.has(language)) {
		return { ok: false, reason: 'Extract variable supports JavaScript/TypeScript only.' };
	}

	const { start, end } = input.selection;
	if (start.line !== end.line) {
		return { ok: false, reason: 'Select a single-line expression to extract.' };
	}

	const lineText = input.lines[start.line]?.text;
	if (lineText === undefined) {
		return { ok: false, reason: 'Select an expression to extract.' };
	}

	const rawStart = Math.max(0, Math.min(start.column, lineText.length));
	const rawEnd = Math.max(rawStart, Math.min(end.column, lineText.length));
	const raw = lineText.slice(rawStart, rawEnd);
	const exprText = raw.trim();
	if (exprText.length === 0) {
		return { ok: false, reason: 'Select an expression to extract.' };
	}

	// Tighten the replace range to the trimmed span so surrounding whitespace is
	// preserved exactly (a leading space before the selection stays put).
	const leadWs = raw.length - raw.trimStart().length;
	const trailWs = raw.length - raw.trimEnd().length;
	const adjStart: Position = { line: start.line, column: rawStart + leadWs };
	const adjEnd: Position = { line: start.line, column: rawEnd - trailWs };

	const lineTokens = tokenize(lineText, language)[0]?.tokens ?? [];

	// Boundary integrity: refuse when either edge of the selection falls STRICTLY
	// inside a string, template, or comment token. Such a boundary slices a
	// lexical token in half — the half-token is dropped by the column filter
	// below (hiding it from every later gate) while the RAW text still carries the
	// broken fragment (an unterminated string, or a `/*` that swallows the next
	// line and silently deletes a binding). This single check closes that class.
	if (
		splitsLexicalToken(lineTokens, adjStart.column) ||
		splitsLexicalToken(lineTokens, adjEnd.column)
	) {
		return { ok: false, reason: 'Selection splits a string, template, or comment.' };
	}

	const inRange = lineTokens.filter(
		(token) => token.start >= adjStart.column && token.end <= adjEnd.column
	);

	if (inRange.some(isCommentToken)) {
		return { ok: false, reason: 'Selection contains a comment, not a pure expression.' };
	}

	const codeTokens = inRange.filter(isCodeToken);

	// A string/number literal selection has no "code" tokens but is a fine
	// expression. Only refuse when there is genuinely nothing of substance.
	const meaningful = inRange.filter((token) => !isWhitespaceText(token) && !isCommentToken(token));
	if (meaningful.length === 0) {
		return { ok: false, reason: 'Select an expression to extract.' };
	}

	// Refuse trivially-simple selections (a lone identifier/number) — extracting
	// `foo` to `const extracted = foo` is noise, not a refactor.
	if (
		meaningful.length === 1 &&
		(IDENTIFIER_TYPES.has(meaningful[0].type) ||
			meaningful[0].type.startsWith('number') ||
			meaningful[0].type.startsWith('constant'))
	) {
		return { ok: false, reason: 'Selection is already a simple value; nothing to extract.' };
	}

	// Balance runs over `meaningful` (templates kept) so a template interpolation
	// `${ … }` balances — its `${` is a string.template token while the closing
	// `}` is a real code brace; counting only the brace would falsely reject every
	// interpolated template.
	const balanceRefusal = checkDelimiterBalance(meaningful);
	if (balanceRefusal) return balanceRefusal;

	const statementRefusal = checkStatementShape(codeTokens);
	if (statementRefusal) return statementRefusal;

	// Completeness runs over `meaningful` (literals kept) — not `codeTokens` —
	// so a leading/trailing string or number literal reads as an operand, not as
	// a missing one (e.g. `'Total: ' + total` must not look like a leading `+`).
	const completenessRefusal = checkExpressionCompleteness(meaningful);
	if (completenessRefusal) return completenessRefusal;

	// A side-effecting expression is only safe to hoist when the selection is the
	// WHOLE value of its statement (`x = <sel>;` / `return <sel>;`). Pulling one
	// out of a short-circuit (`a && f()`), a ternary branch, or a sibling-operand
	// position (`g() + f()`) would change whether/when it runs — valid JS, wrong
	// behavior. `meaningful` (templates kept) is passed so tagged templates count.
	const callRefusal = checkCallContext(
		lineTokens.filter(isCodeToken),
		meaningful,
		adjStart,
		adjEnd
	);
	if (callRefusal) return callRefusal;

	if (hasIdentifierNamed(allCodeTokens(input.lines, language), VAR_NAME)) {
		return { ok: false, reason: `A variable named ${VAR_NAME} already exists.` };
	}

	const indent = lineText.match(/^[\t ]*/)?.[0] ?? '';
	const declarationLine = `${indent}const ${VAR_NAME} = ${exprText};`;

	return {
		ok: true,
		varName: VAR_NAME,
		declarationLine,
		insertLine: start.line,
		replaceRange: { start: adjStart, end: adjEnd }
	};
}

/**
 * Extract the editor's current selection into a hoisted `const` as a SINGLE undo
 * step. On refusal the editor is untouched and the reason is returned so the
 * caller can surface it.
 */
export function extractVariableAt(editor: EditorState): ExtractVariableResult {
	if (!editor.hasSelection) {
		return { ok: false, reason: 'Select an expression to extract.' };
	}

	const { start, end } = editor.normalizedSelection;
	const plan = planExtractVariable({
		lines: editor.lines.map((line) => ({ text: line.text })),
		language: editor.language,
		selection: { start, end }
	});
	if (!plan.ok) return plan;

	applyExtractVariablePlan(editor, plan);
	return { ok: true };
}

/**
 * Apply a successful plan. Order matters: the in-line edits (remove the
 * expression, drop in the name) run first against the original line, then the
 * declaration is prepended at column 0 of that same line — a position the
 * earlier edits never touched — so it lands as a new line directly above.
 */
function applyExtractVariablePlan(editor: EditorState, plan: ExtractVariablePlan): void {
	editor.transact((tx) => {
		tx.delete(plan.replaceRange.start, plan.replaceRange.end);
		tx.insert(plan.replaceRange.start, plan.varName);
		tx.insert({ line: plan.insertLine, column: 0 }, `${plan.declarationLine}\n`);
	});
	// Caret on the new declaration so the user sees what was hoisted.
	editor.setCursor({ line: plan.insertLine, column: plan.declarationLine.length });
}

function isCommentToken(token: Token): boolean {
	return token.type === 'comment' || token.type.startsWith('comment.');
}

function isStringToken(token: Token): boolean {
	return token.type === 'string' || token.type.startsWith('string.');
}

function isWhitespaceText(token: Token): boolean {
	return token.type === 'text' && token.text.trim().length === 0;
}

function isCodeToken(token: Token): boolean {
	return !isCommentToken(token) && !isStringToken(token) && !isWhitespaceText(token);
}

// Operates over `meaningful` tokens (code + strings/templates, no whitespace or
// comments). Strings and regexes are opaque — their inner brackets/backticks
// don't count. Template interpolation is handled symmetrically: a `${` template
// token opens a brace that the interpolation's closing code `}` balances, and
// the literal's backtick delimiters must pair up (an odd count = a cut template).
function checkDelimiterBalance(tokens: Token[]): ExtractVariableRefusal | undefined {
	const incomplete: ExtractVariableRefusal = {
		ok: false,
		reason: 'Selection is not a complete expression.'
	};
	let paren = 0;
	let bracket = 0;
	let brace = 0;
	let backticks = 0;
	for (const token of tokens) {
		if (isTemplateToken(token)) {
			backticks += (token.text.match(/`/g) ?? []).length;
			if (token.text.endsWith('${')) brace++; // interpolation open → matched by the code `}`
			continue;
		}
		if (!isCodeToken(token)) continue; // ordinary strings / regexes are opaque
		if (token.text === '(') paren++;
		else if (token.text === ')') paren--;
		else if (token.text === '[') bracket++;
		else if (token.text === ']') bracket--;
		else if (token.text === '{') brace++;
		else if (token.text === '}') brace--;
		if (paren < 0 || bracket < 0 || brace < 0) return incomplete;
	}
	if (paren !== 0 || bracket !== 0 || brace !== 0) return incomplete;
	if (backticks % 2 === 1) return incomplete; // a template literal cut mid-string
	return undefined;
}

function isTemplateToken(token: Token): boolean {
	return token.type === 'string.template';
}

/**
 * Reject anything that isn't a single value expression: statement keywords,
 * assignments, `await`/`yield`, statement terminators, or a top-level comma
 * (a sequence that would change meaning when hoisted). Nesting is tracked so a
 * comma INSIDE a call/array (depth &gt; 0) stays allowed.
 */
function checkStatementShape(tokens: Token[]): ExtractVariableRefusal | undefined {
	let depth = 0;
	for (let i = 0; i < tokens.length; i++) {
		const token = tokens[i];
		const text = token.text;
		if (text === '(' || text === '[' || text === '{') depth++;
		else if (text === ')' || text === ']' || text === '}') depth--;

		if (text === ';') {
			return { ok: false, reason: 'Selection must be a single expression, not a statement.' };
		}
		if (text === 'await' || text === 'yield') {
			return { ok: false, reason: 'Selection uses await/yield and cannot be safely extracted.' };
		}
		if (depth === 0 && text === ',') {
			return { ok: false, reason: 'Selection spans multiple expressions.' };
		}
		if (depth === 0 && text === '...') {
			return { ok: false, reason: 'Selection is not a complete expression.' };
		}
		// Assignments and ++/-- are MUTATIONS — refuse at ANY nesting depth, since a
		// parenthesized `(x = next())` or `(o.n += 1)` would otherwise slip past a
		// depth-0-only check and get hoisted out of the position it mutates from.
		if (isAssignmentOperator(token)) {
			return { ok: false, reason: 'Selection contains an assignment, not a pure expression.' };
		}
		if (isIncrementHere(tokens, i)) {
			return { ok: false, reason: 'Selection mutates a variable; not a pure value.' };
		}
		if (depth === 0 && STATEMENT_KEYWORDS.has(text) && token.type.startsWith('keyword')) {
			return { ok: false, reason: 'Selection must be an expression, not a statement.' };
		}
	}
	return undefined;
}

// `++`/`--` may arrive as one token or as two adjacent `+`/`-` tokens depending
// on the tokenizer path — detect both. A mutation is never a pure value.
function isIncrementHere(tokens: Token[], i: number): boolean {
	const t = tokens[i];
	if (t.text === '++' || t.text === '--') return true;
	const next = tokens[i + 1];
	return (t.text === '+' || t.text === '-') && next?.text === t.text && t.end === next.start;
}

function isAssignmentOperator(token: Token): boolean {
	return token.type === 'operator' && ASSIGNMENT_OPERATORS.has(token.text);
}

// Operators valid as the FIRST token of an expression (prefix/unary). Anything
// else leading (a binary `*`, `&&`, a stray `.`) means the selection starts
// mid-expression.
const VALID_LEADING_OPERATORS = new Set(['!', '~', '+', '-', '++', '--']);
const POSTFIX_OPERATORS = new Set(['++', '--']);

// Keyword operators the tokenizer types as `keyword` (or, for `satisfies`, as a
// bare identifier) rather than `operator`, so the operator-typed first/last
// checks miss them. INFIX need a LEFT operand (can't lead); NEEDS_RIGHT need a
// RIGHT operand (can't trail). Matched by TEXT to cover the misclassification.
const INFIX_KEYWORDS = new Set(['in', 'instanceof', 'as', 'satisfies']);
const NEEDS_RIGHT_KEYWORDS = new Set([
	'typeof',
	'void',
	'delete',
	'new',
	'keyof',
	'in',
	'instanceof',
	'as',
	'satisfies'
]);

/**
 * Reject selections that start or end mid-expression — a dangling binary/member
 * operator, a keyword operator missing an operand, or a mis-nested ternary —
 * which the delimiter/statement gates miss but which would produce a SyntaxError
 * like `const extracted = in registry;`. Conservative: a false refusal is safe,
 * a false accept is not.
 */
function checkExpressionCompleteness(tokens: Token[]): ExtractVariableRefusal | undefined {
	if (tokens.length === 0) return undefined; // a bare string/number literal

	const incomplete: ExtractVariableRefusal = {
		ok: false,
		reason: 'Selection is not a complete expression.'
	};

	const first = tokens[0];
	if (first.text === '.') return incomplete;
	if (first.type === 'operator' && !VALID_LEADING_OPERATORS.has(first.text)) return incomplete;
	if (INFIX_KEYWORDS.has(first.text)) return incomplete; // leading `in`/`as`/… has no left operand

	const last = tokens[tokens.length - 1];
	if (last.text === '.' || last.text === '?' || last.text === ':') return incomplete;
	if (last.type === 'operator' && !POSTFIX_OPERATORS.has(last.text)) return incomplete;
	if (NEEDS_RIGHT_KEYWORDS.has(last.text)) return incomplete; // trailing `typeof`/`as`/… has no right operand

	// Ternary balance at the selection's top level — a STACK, not a count, so a
	// mis-ordered `b : c ? d` (colon before its `?`) is rejected. A `?` is a
	// ternary head only when it is NOT optional chaining (`?.`) and NOT half of a
	// nullish `??` (the tokenizer emits `??` and `?.` as two adjacent operators).
	let depth = 0;
	let openTernaries = 0;
	for (let i = 0; i < tokens.length; i++) {
		const token = tokens[i];
		const text = token.text;
		if (text === '(' || text === '[' || text === '{') depth++;
		else if (text === ')' || text === ']' || text === '}') depth--;
		else if (
			depth === 0 &&
			text === '?' &&
			!isPartOfPair(tokens, i, '?') &&
			tokens[i + 1]?.text !== '.'
		) {
			openTernaries++;
		} else if (depth === 0 && text === ':') {
			openTernaries--;
			if (openTernaries < 0) return incomplete; // a `:` with no preceding `?`
		}
	}
	if (openTernaries !== 0) return incomplete;

	return undefined;
}

/** Strictly-inside test for the boundary-integrity gate. */
function splitsLexicalToken(tokens: Token[], column: number): boolean {
	return tokens.some(
		(t) => (isStringToken(t) || isCommentToken(t)) && t.start < column && column < t.end
	);
}

/**
 * Half of an adjacent identical-operator pair, e.g. either `?` in `??` (which the
 * tokenizer emits as two separate `?` operators). Used so a nullish `??` is not
 * mistaken for a ternary head.
 */
function isPartOfPair(tokens: Token[], i: number, char: string): boolean {
	const t = tokens[i];
	const prev = tokens[i - 1];
	const next = tokens[i + 1];
	return (
		(next?.text === char && t.end === next.start) || (prev?.text === char && prev.end === t.start)
	);
}

/**
 * Could the selection have a side effect when evaluated? Detecting every call
 * FORM precisely (paren calls, optional calls `fn?.()`, keyword-named property
 * calls `arr.in()`, tagged templates `` tag`x` ``, JSX with embedded calls) is a
 * losing game against the tokenizer, so in the dangerous operand position we are
 * deliberately conservative: ANY paren, `new`, or tagged template counts. A pure
 * value (identifiers, member access, literals, operators) does not.
 */
function hasImpureConstruct(tokens: Token[]): boolean {
	for (let i = 0; i < tokens.length; i++) {
		const t = tokens[i];
		if (t.text === '(') return true; // a call, or a grouped paren — refuse either, conservatively
		if (t.text === 'new' && t.type.startsWith('keyword')) return true;
		if (t.text === 'delete') return true; // a `delete` expression mutates its target
		if (isTemplateToken(t) && i > 0) {
			const prev = tokens[i - 1];
			// A template preceded by a value-producing token is a TAGGED template — a call.
			if (IDENTIFIER_TYPES.has(prev.type) || prev.text === ')' || prev.text === ']') return true;
		}
	}
	return false;
}

/**
 * When the selection is the COMPLETE right-hand value of its statement
 * (`x = <sel>;` / `return <sel>;`), hoisting is always safe — the value is
 * computed in the same place, one line up. When it is a strict sub-expression
 * operand, refuse anything that could carry a side effect.
 */
function checkCallContext(
	lineCodeTokens: Token[],
	selTokens: Token[],
	adjStart: Position,
	adjEnd: Position
): ExtractVariableRefusal | undefined {
	const prev = lineCodeTokens.filter((t) => t.end <= adjStart.column).at(-1);
	const next = lineCodeTokens.find((t) => t.start >= adjEnd.column);
	const isCompleteRhs =
		(!prev || prev.text === '=' || prev.text === 'return') && (!next || next.text === ';');
	if (isCompleteRhs) return undefined;
	if (!hasImpureConstruct(selTokens)) return undefined;
	return {
		ok: false,
		reason:
			'Extracting a call or side-effecting expression from inside a larger expression could change when it runs.'
	};
}

function allCodeTokens(lines: readonly { text: string }[], language: string): Token[] {
	const source = lines.map((line) => line.text).join('\n');
	return tokenize(source, language)
		.flatMap((line) => line.tokens)
		.filter(isCodeToken);
}

function hasIdentifierNamed(tokens: Token[], name: string): boolean {
	return tokens.some((token) => token.text === name && IDENTIFIER_TYPES.has(token.type));
}
