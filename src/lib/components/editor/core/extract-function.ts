import { resolveLanguage, tokenize } from '../tokenizer';
import type { Token } from '../tokenizer';

export type ExtractPlan = {
	ok: true;
	functionText: string;
	callText: string;
	params: string[];
	returns: string[];
	insertAfterLine: number;
};

export type ExtractRefusal = { ok: false; reason: string };

type ExtractInput = {
	lines: readonly { text: string }[];
	language: string;
	region: { startLine: number; endLine: number; type?: string };
	blockStart?: number;
	blockEnd?: number;
};

type FlatToken = Token & { line: number; index: number };

type NamePosition = {
	name: string;
	line: number;
	col: number;
	depth: number;
	index: number;
};

type ScopedDeclaration = NamePosition & {
	kind: string;
	scope?: { startIndex: number; endIndex: number };
};

const SUPPORTED_LANGUAGES = new Set(['javascript', 'typescript', 'jsx', 'tsx']);
const IDENTIFIER_TYPES = new Set(['variable', 'function.call', 'type.class']);
const DECLARATION_KEYWORDS = new Set(['let', 'const', 'var']);
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
const LOOP_OR_SWITCH_KEYWORDS = new Set(['for', 'while', 'do', 'switch']);
const GLOBALS = new Set([
	'console',
	'window',
	'document',
	'Math',
	'JSON',
	'Object',
	'Array',
	'Promise',
	'process',
	'globalThis',
	'undefined',
	'NaN',
	'Infinity',
	'true',
	'false',
	'null',
	'String',
	'Number',
	'Boolean',
	'Function',
	'Symbol',
	'Map',
	'Set',
	'WeakMap',
	'WeakSet',
	'Date',
	'RegExp',
	'Error',
	'TypeError',
	'ReferenceError',
	'SyntaxError',
	'Buffer'
]);

export function planExtractFunction(input: ExtractInput): ExtractPlan | ExtractRefusal {
	try {
		return planExtractFunctionUnsafe(input);
	} catch {
		return { ok: false, reason: 'Could not safely determine the block inputs and outputs.' };
	}
}

function planExtractFunctionUnsafe(input: ExtractInput): ExtractPlan | ExtractRefusal {
	const language = resolveLanguage(input.language);
	if (!SUPPORTED_LANGUAGES.has(language)) {
		return { ok: false, reason: 'Extract function supports JavaScript/TypeScript only.' };
	}

	const lines = input.lines;
	const functionStart = input.region.startLine;
	const functionEnd = input.region.endLine;
	if (!isValidLineRange(lines, functionStart, functionEnd)) {
		return { ok: false, reason: 'Nothing meaningful to extract.' };
	}

	const block = resolveBlock(input, functionStart, functionEnd);
	if (!block || !isValidLineRange(lines, block.start, block.end)) {
		return { ok: false, reason: 'Nothing meaningful to extract.' };
	}
	if (block.start <= functionStart || block.end >= functionEnd) {
		return { ok: false, reason: 'Nothing meaningful to extract.' };
	}
	if (lines.slice(block.start, block.end + 1).every((line) => line.text.trim().length === 0)) {
		return { ok: false, reason: 'Nothing meaningful to extract.' };
	}
	if (lines.slice(block.start, block.end + 1).every((line) => /^[\s{};]*$/.test(line.text))) {
		return { ok: false, reason: 'Nothing meaningful to extract.' };
	}

	const tokenized = tokenize(lines.map((line) => line.text).join('\n'), language);
	const tokensByLine = tokenized.map((line) => getCodeTokens(line.tokens));
	const flatTokens = flattenTokens(tokensByLine, functionStart, functionEnd);
	const blockTokens = flatTokens.filter(
		(token) => token.line >= block.start && token.line <= block.end
	);

	if (hasNameCollision(flatTokens)) {
		return { ok: false, reason: 'A function named extracted already exists.' };
	}
	if (isGeneratorHeader(flatTokens, functionStart)) {
		return { ok: false, reason: 'Selection would escape the new function.' };
	}
	const jumpRefusal = getJumpRefusal(blockTokens);
	if (jumpRefusal) return jumpRefusal;
	if (hasLabelledStatement(blockTokens)) {
		return { ok: false, reason: 'Block contains labelled jumps.' };
	}
	if (!hasBalancedDelimiters(blockTokens)) {
		return { ok: false, reason: 'Selection is not a complete set of statements.' };
	}
	if (hasEscapingBreakOrContinue(blockTokens)) {
		return { ok: false, reason: 'Selection would escape the new function.' };
	}

	const functionParams = getFunctionParams(flatTokens, functionStart);
	const declaredBeforeB = new Set([
		...functionParams,
		...getDeclarations(flatTokens.filter((token) => token.line < block.start)).map(
			(decl) => decl.name
		)
	]);
	const insideDeclarations = getDeclarations(blockTokens);
	const declaredInsideB = new Set(
		insideDeclarations.filter((decl) => decl.kind !== 'param').map((decl) => decl.name)
	);
	const usedInsideB = getIdentifierUses(blockTokens);
	const usedAfterB = new Set(
		getIdentifierUses(flatTokens.filter((token) => token.line > block.end)).map((use) => use.name)
	);

	const laterVarDeclaration = getDeclarations(
		flatTokens.filter((token) => token.line > block.end && token.line <= functionEnd)
	).find((decl) => decl.kind === 'var' && usedInsideB.some((use) => use.name === decl.name));
	if (laterVarDeclaration) {
		return { ok: false, reason: 'Could not safely determine the block inputs and outputs.' };
	}

	for (const decl of insideDeclarations) {
		// Only refuse when the after-block use can ONLY refer to this conditionally
		// defined binding. If the same name is also bound before the block — e.g. a
		// nested arrow/catch param shadows an outer var — the after-use refers to
		// that outer binding (always defined), which is safe.
		if (usedAfterB.has(decl.name) && decl.depth > 0 && !declaredBeforeB.has(decl.name)) {
			return {
				ok: false,
				reason: 'A variable used after the block is only conditionally defined inside it.'
			};
		}
	}

	const params = uniqueByFirstPosition(
		usedInsideB.filter(
			(use) => declaredBeforeB.has(use.name) && !isDeclaredInsideAtUse(use, insideDeclarations)
		)
	);
	const assignedInsideB = getAssignments(blockTokens, insideDeclarations);
	const unmodelledAssignedOutput = assignedInsideB.find(
		(name) =>
			usedAfterB.has(name.name) &&
			!declaredBeforeB.has(name.name) &&
			!declaredInsideB.has(name.name)
	);
	if (unmodelledAssignedOutput) {
		return { ok: false, reason: 'Could not safely determine the block inputs and outputs.' };
	}
	const returns = uniqueByFirstPosition(
		assignedInsideB.filter((name) => usedAfterB.has(name.name))
	);
	const returnNames = returns.map((item) => item.name);
	const declaredReturnNames = new Set(returnNames.filter((name) => declaredInsideB.has(name)));
	const outerReturnNames = returnNames.filter((name) => !declaredInsideB.has(name));

	if (returnNames.length > 1 && outerReturnNames.length > 0) {
		return {
			ok: false,
			reason: 'Block returns multiple values including a reassigned outer variable; not supported.'
		};
	}

	const functionText = buildFunctionText(lines, functionStart, block, params, returnNames);
	const callText = buildCallText(params, returnNames, declaredReturnNames);
	if (!callText) {
		return {
			ok: false,
			reason: 'Block returns multiple values including a reassigned outer variable; not supported.'
		};
	}

	return {
		ok: true,
		functionText,
		callText,
		params: params.map((param) => param.name),
		returns: returnNames,
		insertAfterLine: functionEnd
	};
}

function getCodeTokens(tokens: Token[]): Token[] {
	return tokens.filter((token) => {
		if (token.type === 'text') return token.text.trim().length > 0;
		if (token.type === 'comment' || token.type.startsWith('comment.')) return false;
		if (token.type === 'string' || token.type.startsWith('string.')) return false;
		return true;
	});
}

function flattenTokens(tokensByLine: Token[][], startLine: number, endLine: number): FlatToken[] {
	const flat: FlatToken[] = [];
	for (let line = startLine; line <= endLine; line++) {
		for (const token of tokensByLine[line] ?? []) {
			flat.push({ ...token, line, index: flat.length });
		}
	}
	return flat;
}

function isValidLineRange(lines: readonly { text: string }[], start: number, end: number): boolean {
	return (
		Number.isInteger(start) &&
		Number.isInteger(end) &&
		start >= 0 &&
		end >= start &&
		end < lines.length
	);
}

function resolveBlock(
	input: ExtractInput,
	functionStart: number,
	functionEnd: number
): { start: number; end: number } | undefined {
	if (input.blockStart !== undefined && input.blockEnd !== undefined) {
		return { start: input.blockStart, end: input.blockEnd };
	}
	let end = functionEnd - 1;
	while (end > functionStart && input.lines[end].text.trim().length === 0) end--;
	if (/^\s*return\b/.test(input.lines[end]?.text ?? '')) end--;
	return { start: functionStart + 1, end };
}

function getJumpRefusal(tokens: FlatToken[]): ExtractRefusal | undefined {
	for (const token of tokens) {
		if (token.text === 'return' || token.text === 'yield') {
			return { ok: false, reason: 'Selection would escape the new function.' };
		}
		if (token.text === 'await') {
			return {
				ok: false,
				reason: 'Block uses await; extracting async blocks is not supported yet.'
			};
		}
		if (token.text === 'this' || token.text === 'arguments' || token.text === 'super') {
			return {
				ok: false,
				reason: 'Block references this/arguments/super and cannot be safely extracted.'
			};
		}
		if (token.text === 'new' && nextSignificant(tokens, token.index)?.text === '.') {
			return {
				ok: false,
				reason: 'Block references this/arguments/super and cannot be safely extracted.'
			};
		}
	}
	return undefined;
}

function hasNameCollision(tokens: FlatToken[]): boolean {
	for (let i = 0; i < tokens.length; i++) {
		if (tokens[i].text === 'function' && tokens[i + 1]?.text === 'extracted') return true;
	}
	return false;
}

function isGeneratorHeader(tokens: FlatToken[], functionStart: number): boolean {
	const header = tokens.filter((token) => token.line === functionStart);
	const functionIndex = header.findIndex((token) => token.text === 'function');
	if (functionIndex === -1) return false;
	const parenIndex = header.findIndex(
		(token, index) => index > functionIndex && token.text === '('
	);
	return header
		.slice(functionIndex + 1, parenIndex === -1 ? header.length : parenIndex)
		.some((token) => token.text === '*');
}

function hasBalancedDelimiters(tokens: FlatToken[]): boolean {
	let braces = 0;
	let parens = 0;
	let brackets = 0;
	for (const token of tokens) {
		if (token.text === '{') braces++;
		else if (token.text === '}') braces--;
		else if (token.text === '(') parens++;
		else if (token.text === ')') parens--;
		else if (token.text === '[') brackets++;
		else if (token.text === ']') brackets--;
		if (braces < 0 || parens < 0 || brackets < 0) return false;
	}
	return braces === 0 && parens === 0 && brackets === 0;
}

function hasEscapingBreakOrContinue(tokens: FlatToken[]): boolean {
	for (let i = 0; i < tokens.length; i++) {
		if (tokens[i].text !== 'break' && tokens[i].text !== 'continue') continue;
		const next = tokens[i + 1];
		if (next && /^[A-Za-z_$][\w$]*$/.test(next.text)) return true;
		if (!isInsideBlockOpenedInSelection(tokens, i, LOOP_OR_SWITCH_KEYWORDS)) return true;
	}
	return false;
}

function isInsideBlockOpenedInSelection(
	tokens: FlatToken[],
	index: number,
	openers: Set<string>
): boolean {
	const stack: string[] = [];
	for (let i = 0; i < index; i++) {
		const token = tokens[i];
		if (token.text === '{') {
			let j = i - 1;
			while (j >= 0 && tokens[j].text !== ')' && tokens[j].text !== 'do') j--;
			while (j >= 0 && tokens[j].text !== '(' && tokens[j].text !== 'do') j--;
			const window = tokens.slice(Math.max(0, j - 3), i).map((item) => item.text);
			const opener = window.find((text) => openers.has(text));
			stack.push(opener ?? '');
		} else if (token.text === '}') {
			stack.pop();
		}
	}
	return stack.some((item) => item.length > 0);
}

function hasLabelledStatement(tokens: FlatToken[]): boolean {
	for (let i = 0; i < tokens.length - 1; i++) {
		const token = tokens[i];
		const previous = tokens[i - 1];
		if (
			IDENTIFIER_TYPES.has(token.type) &&
			tokens[i + 1].text === ':' &&
			!isObjectLiteralKey(tokens, i) &&
			(!previous || previous.text === ';' || previous.text === '{' || previous.text === '}')
		) {
			return true;
		}
		if (
			(token.text === 'break' || token.text === 'continue') &&
			/^[A-Za-z_$][\w$]*$/.test(tokens[i + 1].text)
		) {
			return true;
		}
	}
	return false;
}

function getFunctionParams(tokens: FlatToken[], functionStart: number): string[] {
	const startIndex = tokens.findIndex(
		(token) => token.line === functionStart && token.text === '('
	);
	if (startIndex === -1) return [];
	const endIndex = findMatching(tokens, startIndex, '(', ')');
	if (endIndex === -1) return [];
	return collectBindingNames(tokens.slice(startIndex + 1, endIndex));
}

function getDeclarations(tokens: FlatToken[]): ScopedDeclaration[] {
	const declarations: ScopedDeclaration[] = [];
	for (let i = 0; i < tokens.length; i++) {
		const token = tokens[i];
		if (DECLARATION_KEYWORDS.has(token.text)) {
			const end = findStatementEnd(tokens, i + 1);
			const segment = tokens.slice(i + 1, end);
			const names = collectDeclarationNames(segment);
			for (const name of names) {
				declarations.push({
					...name,
					kind: token.text,
					depth: getBraceDepthAt(tokens, name.line, name.col)
				});
			}
		} else if (token.text === 'function') {
			const next = tokens[i + 1];
			if (next && isIdentifierToken(next)) {
				declarations.push({
					name: next.text,
					line: next.line,
					col: next.start,
					index: next.index,
					depth: getBraceDepthAt(tokens, next.line, next.start),
					kind: 'function'
				});
			}
			const paramStart = tokens.findIndex((item, index) => index > i && item.text === '(');
			if (paramStart !== -1) {
				const paramEnd = findMatching(tokens, paramStart, '(', ')');
				if (paramEnd !== -1) {
					const scope = getFunctionParamScope(tokens, paramStart, paramEnd);
					for (const name of collectBindingNamePositions(tokens.slice(paramStart + 1, paramEnd))) {
						declarations.push({
							...name,
							depth: getBraceDepthAt(tokens, name.line, name.col) + 1,
							kind: 'param',
							scope
						});
					}
				}
			}
		} else if (token.text === 'catch' && tokens[i + 1]?.text === '(') {
			const paramEnd = findMatching(tokens, i + 1, '(', ')');
			if (paramEnd !== -1) {
				const scope = getCatchParamScope(tokens, i + 1, paramEnd);
				for (const name of collectBindingNamePositions(tokens.slice(i + 2, paramEnd))) {
					declarations.push({
						...name,
						depth: getBraceDepthAt(tokens, name.line, name.col) + 1,
						kind: 'param',
						scope
					});
				}
			}
		} else if (token.text === '=>') {
			const previous = tokens[i - 1];
			if (previous?.text === ')') {
				const paramStart = findMatchingBackward(tokens, i - 1, '(', ')');
				if (paramStart !== -1) {
					const scope = getArrowParamScope(tokens, paramStart, i);
					for (const name of collectBindingNamePositions(tokens.slice(paramStart + 1, i - 1))) {
						declarations.push({
							...name,
							depth: getBraceDepthAt(tokens, name.line, name.col) + 1,
							kind: 'param',
							scope
						});
					}
				}
			} else if (isIdentifierToken(previous)) {
				const scope = getArrowParamScope(tokens, i - 1, i);
				declarations.push({
					name: previous.text,
					line: previous.line,
					col: previous.start,
					index: previous.index,
					depth: getBraceDepthAt(tokens, previous.line, previous.start) + 1,
					kind: 'param',
					scope
				});
			}
		}
	}
	return declarations;
}

function isDeclaredInsideAtUse(use: NamePosition, declarations: ScopedDeclaration[]): boolean {
	return declarations.some((decl) => {
		if (decl.name !== use.name) return false;
		if (decl.kind !== 'param') return true;
		if (!decl.scope) return use.index === decl.index;
		return use.index >= decl.scope.startIndex && use.index <= decl.scope.endIndex;
	});
}

function getFunctionParamScope(
	tokens: FlatToken[],
	paramStart: number,
	paramEnd: number
): { startIndex: number; endIndex: number } {
	const bodyStart = tokens.findIndex((item, index) => index > paramEnd && item.text === '{');
	if (bodyStart === -1) {
		return { startIndex: tokens[paramStart].index, endIndex: tokens[paramEnd].index };
	}
	const bodyEnd = findMatching(tokens, bodyStart, '{', '}');
	return {
		startIndex: tokens[paramStart].index,
		endIndex: tokens[bodyEnd === -1 ? paramEnd : bodyEnd].index
	};
}

function getCatchParamScope(
	tokens: FlatToken[],
	paramStart: number,
	paramEnd: number
): { startIndex: number; endIndex: number } {
	const bodyStart = tokens.findIndex((item, index) => index > paramEnd && item.text === '{');
	if (bodyStart === -1) {
		return { startIndex: tokens[paramStart].index, endIndex: tokens[paramEnd].index };
	}
	const bodyEnd = findMatching(tokens, bodyStart, '{', '}');
	return {
		startIndex: tokens[paramStart].index,
		endIndex: tokens[bodyEnd === -1 ? paramEnd : bodyEnd].index
	};
}

function getArrowParamScope(
	tokens: FlatToken[],
	paramStart: number,
	arrowIndex: number
): { startIndex: number; endIndex: number } {
	const bodyStart = arrowIndex + 1;
	if (!tokens[bodyStart]) {
		return { startIndex: tokens[paramStart].index, endIndex: tokens[arrowIndex].index };
	}
	if (tokens[bodyStart].text === '{') {
		const bodyEnd = findMatching(tokens, bodyStart, '{', '}');
		return {
			startIndex: tokens[paramStart].index,
			endIndex: tokens[bodyEnd === -1 ? bodyStart : bodyEnd].index
		};
	}
	const bodyEnd = findArrowExpressionEnd(tokens, bodyStart);
	return {
		startIndex: tokens[paramStart].index,
		endIndex: tokens[Math.max(bodyStart, bodyEnd)].index
	};
}

function findArrowExpressionEnd(tokens: FlatToken[], bodyStart: number): number {
	let paren = 0;
	let bracket = 0;
	let brace = 0;
	for (let i = bodyStart; i < tokens.length; i++) {
		const token = tokens[i];
		if (
			paren === 0 &&
			bracket === 0 &&
			brace === 0 &&
			(token.text === ',' ||
				token.text === ';' ||
				token.text === ')' ||
				token.text === ']' ||
				token.text === '}')
		) {
			return i - 1;
		}
		if (token.text === '(') paren++;
		else if (token.text === ')') paren--;
		else if (token.text === '[') bracket++;
		else if (token.text === ']') bracket--;
		else if (token.text === '{') brace++;
		else if (token.text === '}') brace--;
	}
	return tokens.length - 1;
}

function collectDeclarationNames(tokens: FlatToken[]): NamePosition[] {
	const names: NamePosition[] = [];
	let paren = 0;
	let bracket = 0;
	let brace = 0;
	let expectingName = true;
	for (let i = 0; i < tokens.length; i++) {
		const token = tokens[i];
		if (token.text === '(') paren++;
		else if (token.text === ')') paren--;
		else if (token.text === '[') bracket++;
		else if (token.text === ']') bracket--;
		else if (token.text === '{') brace++;
		else if (token.text === '}') brace--;

		if ((token.text === '{' || token.text === '[') && expectingName && paren === 0) {
			throw new Error('destructuring declaration');
		}
		if (expectingName && paren === 0 && bracket === 0 && brace === 0 && isIdentifierToken(token)) {
			names.push({
				name: token.text,
				line: token.line,
				col: token.start,
				depth: 0,
				index: token.index
			});
			expectingName = false;
			continue;
		}
		if (paren === 0 && bracket === 0 && brace === 0 && token.text === ',') {
			expectingName = true;
		}
	}
	return names;
}

function collectBindingNames(tokens: FlatToken[]): string[] {
	return collectBindingNamePositions(tokens).map((name) => name.name);
}

function collectBindingNamePositions(tokens: FlatToken[]): NamePosition[] {
	const positions: NamePosition[] = [];
	let paren = 0;
	let bracket = 0;
	let brace = 0;
	let inType = false;
	let expectingName = true;
	for (const token of tokens) {
		if (token.text === '<') inType = true;
		if (token.text === '>') inType = false;
		if (token.text === ':') {
			inType = true;
			continue;
		}
		if (token.text === ',' && paren === 0 && bracket === 0 && brace === 0) {
			inType = false;
			expectingName = true;
			continue;
		}
		if (inType) continue;
		if (token.text === '(') paren++;
		else if (token.text === ')') paren--;
		else if (token.text === '[') bracket++;
		else if (token.text === ']') bracket--;
		else if (token.text === '{') brace++;
		else if (token.text === '}') brace--;
		if (expectingName && paren === 0 && bracket === 0 && brace === 0 && isIdentifierToken(token)) {
			positions.push({
				name: token.text,
				line: token.line,
				col: token.start,
				depth: 0,
				index: token.index
			});
			expectingName = false;
		}
	}
	const seen = new Set<string>();
	return positions.filter((position) => {
		if (seen.has(position.name)) return false;
		seen.add(position.name);
		return true;
	});
}

function getIdentifierUses(tokens: FlatToken[]): NamePosition[] {
	const uses: NamePosition[] = [];
	for (let i = 0; i < tokens.length; i++) {
		const token = tokens[i];
		if (!isIdentifierUse(tokens, i)) continue;
		uses.push({
			name: token.text,
			line: token.line,
			col: token.start,
			index: token.index,
			depth: getBraceDepthAt(tokens, token.line, token.start)
		});
	}
	return uses;
}

function isIdentifierUse(tokens: FlatToken[], index: number): boolean {
	const token = tokens[index];
	if (!isIdentifierToken(token)) return false;
	if (GLOBALS.has(token.text)) return false;
	const previous = tokens[index - 1];
	if (previous?.text === '.') return false;
	if (isObjectLiteralKey(tokens, index)) return false;
	if (previous?.text === 'function') return false;
	if (previous && DECLARATION_KEYWORDS.has(previous.text)) return false;
	if (
		token.type.startsWith('keyword') ||
		token.type.startsWith('constant') ||
		token.type === 'type.builtin'
	)
		return false;
	return true;
}

function getAssignments(tokens: FlatToken[], declarations: ScopedDeclaration[]): NamePosition[] {
	// Seed with the block's own let/const/var/function declarations (a declared
	// value used after the block is a return). Nested fn/arrow/catch params are
	// NOT outputs — they're bindings scoped to their construct; a real assignment
	// to one is still picked up by the operator scan below.
	const assigned: NamePosition[] = declarations
		.filter((decl) => decl.kind !== 'param')
		.map((decl) => ({
			name: decl.name,
			line: decl.line,
			col: decl.col,
			index: decl.index,
			depth: decl.depth
		}));
	for (let i = 0; i < tokens.length; i++) {
		if (isAssignmentOperatorToken(tokens, i)) {
			const target = previousIdentifierInAssignment(tokens, i);
			if (target) assigned.push(target);
		}
		const incrementTarget = identifierInIncrement(tokens, i);
		if (incrementTarget) {
			assigned.push(incrementTarget);
		}
	}
	return uniqueByFirstPosition(assigned);
}

function isAssignmentOperatorToken(tokens: FlatToken[], index: number): boolean {
	const token = tokens[index];
	if (!ASSIGNMENT_OPERATORS.has(token.text)) return false;
	if (token.text !== '=') return true;
	const previous = tokens[index - 1];
	const next = tokens[index + 1];
	if (previous && ['=', '!', '<', '>', '=>'].includes(previous.text)) return false;
	if (next && (next.text === '=' || next.text === '>')) return false;
	return token.type === 'operator';
}

function identifierInIncrement(tokens: FlatToken[], index: number): NamePosition | undefined {
	const first = tokens[index];
	const second = tokens[index + 1];
	if (!first || !second) return undefined;
	if ((first.text !== '+' && first.text !== '-') || second.text !== first.text) return undefined;
	if (!areAdjacent(first, second)) return undefined;
	const previous = tokens[index - 1];
	// A run of 3+ identical operators (e.g. `a+++b` is `a++ + b`) yields overlapping
	// pairs; only the run's leading pair is a real increment. Skip a pair whose
	// previous token is the same operator adjacent to it, so the trailing operand
	// (`b`) is never spuriously modeled as a mutation target.
	if (previous && previous.text === first.text && areAdjacent(previous, first)) return undefined;

	const next = tokens[index + 2];
	const target = isIdentifierToken(previous)
		? previous
		: isIdentifierToken(next)
			? next
			: undefined;
	if (!target) return undefined;
	if (target === previous && tokens[index - 2]?.text === '.') return undefined;
	if (target === next && tokens[index + 3]?.text === '.') return undefined;
	return {
		name: target.text,
		line: target.line,
		col: target.start,
		index: target.index,
		depth: getBraceDepthAt(tokens, target.line, target.start)
	};
}

function previousIdentifierInAssignment(
	tokens: FlatToken[],
	assignmentIndex: number
): NamePosition | undefined {
	let i = assignmentIndex - 1;
	let crossedMemberOrComputed = false;
	while (i >= 0 && tokens[i].type === 'operator') i--;
	while (i >= 0 && (tokens[i].text === ')' || tokens[i].text === ']')) {
		crossedMemberOrComputed = true;
		const opener = tokens[i].text === ')' ? '(' : '[';
		const closer = tokens[i].text;
		let depth = 1;
		i--;
		while (i >= 0 && depth > 0) {
			if (tokens[i].text === closer) depth++;
			else if (tokens[i].text === opener) depth--;
			i--;
		}
		while (i >= 0 && tokens[i].type === 'operator') i--;
	}
	if (
		i >= 0 &&
		isIdentifierToken(tokens[i]) &&
		tokens[i - 1]?.text !== '.' &&
		!crossedMemberOrComputed
	) {
		return {
			name: tokens[i].text,
			line: tokens[i].line,
			col: tokens[i].start,
			index: tokens[i].index,
			depth: getBraceDepthAt(tokens, tokens[i].line, tokens[i].start)
		};
	}
	return undefined;
}

function isObjectLiteralKey(tokens: FlatToken[], index: number): boolean {
	const previous = tokens[index - 1];
	const next = tokens[index + 1];
	return (
		isIdentifierToken(tokens[index]) &&
		(previous?.text === '{' || previous?.text === ',') &&
		next?.text === ':'
	);
}

function uniqueByFirstPosition<T extends NamePosition>(items: T[]): T[] {
	const byName = new Map<string, T>();
	for (const item of [...items].sort((a, b) => a.line - b.line || a.col - b.col)) {
		if (!byName.has(item.name)) byName.set(item.name, item);
	}
	return [...byName.values()];
}

function buildFunctionText(
	lines: readonly { text: string }[],
	functionStart: number,
	block: { start: number; end: number },
	params: NamePosition[],
	returnNames: string[]
): string {
	const functionIndent = lines[functionStart].text.match(/^[ \t]*/)?.[0] ?? '';
	const bodyIndent = `${functionIndent}\t`;
	const blockLines = lines.slice(block.start, block.end + 1).map((line) => line.text);
	const blockIndent = commonIndent(blockLines.filter((line) => line.trim().length > 0));
	const reindented = blockLines.map((line) =>
		line.trim().length === 0 ? bodyIndent : `${bodyIndent}${line.slice(blockIndent.length)}`
	);
	const output = [
		`${functionIndent}function extracted(${params.map((param) => param.name).join(', ')}) {`,
		...reindented
	];
	if (returnNames.length === 1) {
		output.push(`${bodyIndent}return ${returnNames[0]};`);
	} else if (returnNames.length > 1) {
		output.push(`${bodyIndent}return { ${returnNames.join(', ')} };`);
	}
	output.push(`${functionIndent}}`);
	return output.join('\n');
}

function buildCallText(
	params: NamePosition[],
	returns: string[],
	declaredReturnNames: Set<string>
): string | undefined {
	const args = params.map((param) => param.name).join(', ');
	const call = `extracted(${args})`;
	if (returns.length === 0) return `${call};`;
	if (returns.length === 1) {
		const name = returns[0];
		return declaredReturnNames.has(name) ? `const ${name} = ${call};` : `${name} = ${call};`;
	}
	if (returns.every((name) => declaredReturnNames.has(name))) {
		return `const { ${returns.join(', ')} } = ${call};`;
	}
	return undefined;
}

function commonIndent(lines: string[]): string {
	if (lines.length === 0) return '';
	let best = lines[0].match(/^[ \t]*/)?.[0] ?? '';
	for (const line of lines.slice(1)) {
		const indent = line.match(/^[ \t]*/)?.[0] ?? '';
		let index = 0;
		while (index < best.length && index < indent.length && best[index] === indent[index]) index++;
		best = best.slice(0, index);
	}
	return best;
}

function getBraceDepthAt(tokens: FlatToken[], line: number, col: number): number {
	let depth = 0;
	for (const token of tokens) {
		if (token.line > line || (token.line === line && token.start >= col)) break;
		if (token.text === '{') depth++;
		else if (token.text === '}') depth = Math.max(0, depth - 1);
	}
	return depth;
}

function findStatementEnd(tokens: FlatToken[], start: number): number {
	let paren = 0;
	let bracket = 0;
	let brace = 0;
	for (let i = start; i < tokens.length; i++) {
		const token = tokens[i];
		if (token.text === '(') paren++;
		else if (token.text === ')') paren--;
		else if (token.text === '[') bracket++;
		else if (token.text === ']') bracket--;
		else if (token.text === '{') brace++;
		else if (token.text === '}') brace--;
		else if (token.text === ';' && paren === 0 && bracket === 0 && brace === 0) return i;
	}
	return tokens.length;
}

function findMatching(tokens: FlatToken[], start: number, open: string, close: string): number {
	let depth = 0;
	for (let i = start; i < tokens.length; i++) {
		if (tokens[i].text === open) depth++;
		else if (tokens[i].text === close) {
			depth--;
			if (depth === 0) return i;
		}
	}
	return -1;
}

function findMatchingBackward(
	tokens: FlatToken[],
	start: number,
	open: string,
	close: string
): number {
	let depth = 0;
	for (let i = start; i >= 0; i--) {
		if (tokens[i].text === close) depth++;
		else if (tokens[i].text === open) {
			depth--;
			if (depth === 0) return i;
		}
	}
	return -1;
}

function nextSignificant(tokens: FlatToken[], index: number): FlatToken | undefined {
	return tokens.find((token) => token.index > index);
}

function isIdentifierToken(token: FlatToken | undefined): token is FlatToken {
	return !!token && IDENTIFIER_TYPES.has(token.type);
}

function areAdjacent(left: FlatToken, right: FlatToken): boolean {
	return left.line === right.line && left.end === right.start;
}
