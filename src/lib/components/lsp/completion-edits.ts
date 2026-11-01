/**
 * Turn an LSP CompletionItem into concrete editor edits.
 *
 * Handles textEdit (plain and insert/replace), insertText, label, snippet
 * syntax (insertTextFormat 2) and additionalTextEdits such as auto-imports.
 * Positions are 0-based line/column in UTF-16 units, matching both LSP and
 * the editor.
 */
import type { CompletionItem, Range } from '../../types/lsp';

export interface EditorPos {
	line: number;
	column: number;
}

export interface CompletionPlan {
	edits: { from: EditorPos; to: EditorPos; text: string }[];
	caret: EditorPos;
}

const SNIPPET_FORMAT = 2;
const IDENT = /[\p{L}\p{N}_$]/u;

/**
 * Strip LSP snippet syntax down to plain text. Returns the text and the offset
 * where the caret should land: the first tab stop ($1, falling back to $0), or
 * the end when there are none.
 */
export function expandSnippet(snippet: string): { text: string; caret: number } {
	let out = '';
	const stops = new Map<number, number>();
	let i = 0;
	const parse = (endChar: string | null): void => {
		while (i < snippet.length) {
			const ch = snippet[i];
			if (endChar && ch === endChar) return;
			if (ch === '\\' && i + 1 < snippet.length) {
				out += snippet[i + 1];
				i += 2;
				continue;
			}
			if (ch === '$') {
				const rest = snippet.slice(i);
				const simple = /^\$(\d+)/.exec(rest);
				if (simple) {
					const n = Number(simple[1]);
					if (!stops.has(n)) stops.set(n, out.length);
					i += simple[0].length;
					continue;
				}
				const braced = /^\$\{(\d+)([:|]?)/.exec(rest);
				if (braced) {
					const n = Number(braced[1]);
					if (!stops.has(n)) stops.set(n, out.length);
					i += braced[0].length;
					if (braced[2] === '|') {
						// Choice: keep the first option.
						const close = snippet.indexOf('|}', i);
						const choices = close === -1 ? snippet.slice(i) : snippet.slice(i, close);
						out += choices.split(',')[0];
						i = close === -1 ? snippet.length : close + 2;
						continue;
					}
					parse('}');
					i++; // skip the closing brace
					continue;
				}
				const variable = /^\$(\{)?([A-Za-z_]\w*)(:)?/.exec(rest);
				if (variable) {
					// Variables are not resolved: keep their default if one is given.
					i += variable[0].length;
					if (variable[1]) {
						parse('}');
						i++;
					}
					continue;
				}
			}
			out += ch;
			i++;
		}
	};
	parse(null);
	const firstStop = [...stops.keys()].filter((n) => n > 0).sort((a, b) => a - b)[0];
	const caret = firstStop !== undefined ? stops.get(firstStop)! : (stops.get(0) ?? out.length);
	return { text: out, caret };
}

function lineStarts(text: string): number[] {
	const starts = [0];
	for (let i = 0; i < text.length; i++) if (text[i] === '\n') starts.push(i + 1);
	return starts;
}

function toOffset(
	starts: number[],
	text: string,
	pos: { line: number; character: number }
): number {
	if (pos.line >= starts.length) return text.length;
	const lineStart = starts[Math.max(0, pos.line)];
	const lineEnd = pos.line + 1 < starts.length ? starts[pos.line + 1] - 1 : text.length;
	return Math.min(lineStart + Math.max(0, pos.character), lineEnd);
}

function toPos(starts: number[], offset: number): EditorPos {
	let lo = 0;
	let hi = starts.length - 1;
	while (lo < hi) {
		const mid = (lo + hi + 1) >> 1;
		if (starts[mid] <= offset) lo = mid;
		else hi = mid - 1;
	}
	return { line: lo, column: offset - starts[lo] };
}

/**
 * Build the edits for accepting item with the caret at (line, column) in
 * content. Without a textEdit, the identifier fragment before the caret is
 * replaced, so typing "con" and accepting "console" yields "console".
 */
export function planCompletionEdits(
	item: CompletionItem,
	content: string,
	line: number,
	column: number
): CompletionPlan {
	const starts = lineStarts(content);
	const cursor = toOffset(starts, content, { line, character: column });

	let range: Range | undefined;
	let raw: string;
	const edit = item.textEdit as
		{ range?: Range; insert?: Range; replace?: Range; newText: string } | undefined;
	if (edit) {
		range = edit.range ?? edit.replace ?? edit.insert;
		raw = edit.newText;
	} else {
		raw = item.insertText ?? item.label;
	}

	let start: number;
	let end: number;
	if (range) {
		start = toOffset(starts, content, range.start);
		end = toOffset(starts, content, range.end);
	} else {
		start = cursor;
		const lineStart = starts[Math.min(line, starts.length - 1)];
		while (start > lineStart && IDENT.test(content[start - 1])) start--;
		end = cursor;
	}

	const isSnippet = item.insertTextFormat === SNIPPET_FORMAT;
	const { text, caret } = isSnippet ? expandSnippet(raw) : { text: raw, caret: raw.length };

	type OffsetEdit = { start: number; end: number; text: string };
	const main: OffsetEdit = { start, end, text };
	const extra: OffsetEdit[] = (item.additionalTextEdits ?? []).map((e) => ({
		start: toOffset(starts, content, e.range.start),
		end: toOffset(starts, content, e.range.end),
		text: e.newText
	}));
	// LSP forbids overlap with the main edit; drop any that do rather than corrupt text.
	const safeExtra = extra.filter((e) => e.end <= main.start || e.start >= main.end);
	const all = [main, ...safeExtra];

	// Final caret offset: main start + caret, shifted by edits that land before it.
	let caretOffset = main.start + caret;
	for (const e of safeExtra) {
		if (e.end <= main.start) caretOffset += e.text.length - (e.end - e.start);
	}

	let finalText = content;
	for (const e of [...all].sort((a, b) => b.start - a.start)) {
		finalText = finalText.slice(0, e.start) + e.text + finalText.slice(e.end);
	}

	return {
		edits: all.map((e) => ({
			from: toPos(starts, e.start),
			to: toPos(starts, e.end),
			text: e.text
		})),
		caret: toPos(lineStarts(finalText), caretOffset)
	};
}
