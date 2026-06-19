import type { EditorState } from './state';
import { planExtractFunction, type ExtractPlan, type ExtractRefusal } from './extract-function';
import type { ComplexityMetrics, ComplexityRegion } from './complexity-analyzer';
import { tokenize } from '../tokenizer';

export type ExtractFunctionResult = { ok: true } | ExtractRefusal;

// Tokens after which a `{` opens an object literal (a value position) rather than
// a statement block.
const OBJECT_LITERAL_PRECEDERS = new Set([
	'=',
	'(',
	'[',
	',',
	':',
	'return',
	'=>',
	'?',
	'&&',
	'||',
	'??',
	'!'
]);

/**
 * Would the new function — inserted as a sibling after `insertAfterLine` — land
 * inside a container where a `function` declaration is NOT valid (a class body,
 * or an object/array literal)? The applier writes a bare `function extracted()`
 * there, which is a SyntaxError, so the orchestration refuses these. Scans the
 * brace nesting through the insertion line, classifying each `{` as a class
 * body, object literal, or statement block.
 */
function insertionInNonFunctionContainer(
	lines: readonly { text: string }[],
	language: string,
	insertAfterLine: number
): boolean {
	const source = lines
		.slice(0, insertAfterLine + 1)
		.map((line) => line.text)
		.join('\n');
	const tokens = tokenize(source, language)
		.flatMap((line) => line.tokens)
		.filter((t) => {
			if (t.type === 'text') return t.text.trim().length > 0;
			if (t.type === 'comment' || t.type.startsWith('comment.')) return false;
			if (t.type === 'string' || t.type.startsWith('string.')) return false;
			return true;
		});

	const stack: Array<'block' | 'object' | 'class'> = [];
	let prev = '';
	let pendingClass = false;

	for (const t of tokens) {
		const text = t.text;
		if (text === 'class' && t.type.startsWith('keyword')) {
			pendingClass = true;
		} else if (text === '{') {
			stack.push(pendingClass ? 'class' : OBJECT_LITERAL_PRECEDERS.has(prev) ? 'object' : 'block');
			pendingClass = false;
		} else if (text === '}') {
			stack.pop();
		} else if (text === '[') {
			stack.push('object'); // array/computed literal is not a statement container
		} else if (text === ']') {
			stack.pop();
		}
		prev = text;
	}

	const top = stack[stack.length - 1];
	return top === 'object' || top === 'class';
}

/**
 * Find the innermost enclosing region whose [startLine, endLine] (0-based,
 * inclusive) contains the block. Prefers `function` regions; ties are broken by
 * the smallest span. Returns undefined when no region encloses the block.
 */
export function findEnclosingFunctionRegion(
	metrics: ComplexityMetrics | null,
	blockStart: number,
	blockEnd: number
): ComplexityRegion | undefined {
	if (!metrics) return undefined;
	const containing = metrics.regions.filter(
		(r) => r.startLine <= blockStart && blockEnd <= r.endLine
	);
	if (containing.length === 0) return undefined;
	const functions = containing.filter((r) => r.type === 'function');
	const pool = functions.length > 0 ? functions : containing;
	return pool.reduce((best, r) =>
		r.endLine - r.startLine < best.endLine - best.startLine ? r : best
	);
}

/**
 * Apply a successful ExtractPlan to a live editor as a SINGLE undo step. Edits
 * are issued bottom-up: the new function is inserted AFTER the enclosing
 * function first (it sits below the block, so the block's line numbers stay
 * valid), then the block is replaced by the call at its original indentation.
 */
export function applyExtractPlan(
	editor: EditorState,
	plan: ExtractPlan,
	blockStart: number,
	blockEnd: number
): void {
	// Geometry captured from the pre-edit document.
	const indent = editor.getLine(blockStart)?.text.match(/^[ \t]*/)?.[0] ?? '';
	const insertLine = plan.insertAfterLine;
	const insertCol = editor.getLine(insertLine)?.text.length ?? 0;
	const blockEndCol = editor.getLine(blockEnd)?.text.length ?? 0;
	const callText = indent + plan.callText;

	editor.transact((tx) => {
		// 1. New function after the enclosing function's last line.
		tx.insert({ line: insertLine, column: insertCol }, `\n${plan.functionText}`);
		// 2. Remove the block's text — the lines collapse to one empty line at blockStart.
		tx.delete({ line: blockStart, column: 0 }, { line: blockEnd, column: blockEndCol });
		// 3. Drop in the call at the block's original indent.
		tx.insert({ line: blockStart, column: 0 }, callText);
	});

	// Caret at the end of the new call.
	editor.setCursor({ line: blockStart, column: callText.length });
}

/**
 * Extract the editor's current line selection into a new function. Finds the
 * enclosing function from the complexity metrics, runs the (pure) planner, and
 * either applies the plan or returns the planner's refusal so the caller can
 * surface the reason to the user.
 */
export function extractFunctionAt(
	editor: EditorState,
	metrics: ComplexityMetrics | null
): ExtractFunctionResult {
	if (!editor.hasSelection) {
		return { ok: false, reason: 'Select a block of statements to extract.' };
	}

	const { start, end } = editor.normalizedSelection;
	const blockStart = start.line;
	// A selection ending at column 0 of a later line covers the full lines above it.
	const blockEnd = end.column === 0 && end.line > start.line ? end.line - 1 : end.line;

	const region = findEnclosingFunctionRegion(metrics, blockStart, blockEnd);
	if (!region) {
		return { ok: false, reason: 'Place the selection inside a function to extract from.' };
	}

	// The applier inserts the new function as a sibling after the enclosing
	// function's last line. The analyzer types class/object methods as `function`
	// too, so that insertion can land inside a class body or object/array literal,
	// where a bare `function extracted()` is a SyntaxError. Refuse rather than
	// miswrite until method extraction is supported. (The region-based class check
	// is kept as defense-in-depth alongside the brace-context scan.)
	const inClassRegion = metrics?.regions.some(
		(r) =>
			r !== region &&
			r.type === 'class' &&
			r.startLine <= region.startLine &&
			region.endLine <= r.endLine
	);
	if (
		inClassRegion ||
		insertionInNonFunctionContainer(editor.lines, editor.language, region.endLine)
	) {
		return { ok: false, reason: 'Extracting from a class or object method is not supported yet.' };
	}

	const plan = planExtractFunction({
		lines: editor.lines.map((line) => ({ text: line.text })),
		language: editor.language,
		region: { startLine: region.startLine, endLine: region.endLine, type: region.type },
		blockStart,
		blockEnd
	});

	if (!plan.ok) return plan;
	applyExtractPlan(editor, plan, blockStart, blockEnd);
	return { ok: true };
}
