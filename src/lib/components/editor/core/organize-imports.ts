import { resolveLanguage } from '../tokenizer';
import type { EditorState } from './state';

export type OrganizeImportsPlan = {
	ok: true;
	/** 0-based first line of the import block being replaced. */
	startLine: number;
	/** 0-based last line of the import block being replaced (inclusive). */
	endLine: number;
	/** The reorganized import block (no trailing newline). */
	newText: string;
};

export type OrganizeImportsRefusal = { ok: false; reason: string };

export type OrganizeImportsResult = { ok: true } | OrganizeImportsRefusal;

type NamedSpecifier = { name: string; alias?: string; typeOnly?: boolean };

type ParsedImport = {
	source: string;
	quote: string;
	typeOnly: boolean;
	defaultImport?: string;
	namespace?: string;
	named?: NamedSpecifier[];
};

const SUPPORTED_LANGUAGES = new Set(['javascript', 'typescript', 'jsx', 'tsx']);
const IDENT = '[A-Za-z_$][\\w$]*';

/**
 * Plan an "organize imports" rewrite of the leading import block: sort the
 * statements by module path, sort the named specifiers within each, and drop
 * exact-duplicate statements. PURE — no editor mutation.
 *
 * Safe-or-refuse: this build only touches a contiguous run of single-line
 * `import … from '…'` statements at the top of the file. It refuses (rather than
 * risk changing behavior) on side-effect imports, multi-line imports, comments
 * interleaved in the block, or any statement it cannot fully parse.
 */
export function planOrganizeImports(input: {
	lines: readonly { text: string }[];
	language: string;
}): OrganizeImportsPlan | OrganizeImportsRefusal {
	try {
		return planOrganizeImportsUnsafe(input);
	} catch {
		return { ok: false, reason: 'Could not safely parse the imports; leaving them untouched.' };
	}
}

function planOrganizeImportsUnsafe(input: {
	lines: readonly { text: string }[];
	language: string;
}): OrganizeImportsPlan | OrganizeImportsRefusal {
	const language = resolveLanguage(input.language);
	if (!SUPPORTED_LANGUAGES.has(language)) {
		return { ok: false, reason: 'Organize imports supports JavaScript/TypeScript only.' };
	}

	const lines = input.lines.map((line) => line.text);

	// Find the first import statement; everything above it (license headers,
	// blank lines, leading comments) is left untouched.
	const firstImport = lines.findIndex((text) => /^\s*import\b/.test(text));
	if (firstImport === -1) {
		return { ok: false, reason: 'No imports to organize.' };
	}

	// Walk the contiguous leading run: import lines and blank lines. A comment
	// ENDS the run unless another import follows it — only a comment BETWEEN two
	// imports is the unsupported "interleaved" case. A trailing body comment (a
	// section header, the first JSDoc) is just the end of the block and must not
	// make organize refuse.
	let lastImport = firstImport;
	const importLineIndices: number[] = [];
	let sawCommentInRun = false;
	let commentBetweenImports = false;
	for (let i = firstImport; i < lines.length; i++) {
		const text = lines[i];
		if (text.trim().length === 0) continue; // blank lines tolerated inside the run
		if (isCommentLine(text)) {
			sawCommentInRun = true;
			continue;
		}
		if (!/^\s*import\b/.test(text)) break; // a code line ends the run
		if (sawCommentInRun) commentBetweenImports = true; // a comment preceded THIS import
		importLineIndices.push(i);
		lastImport = i;
	}

	if (commentBetweenImports) {
		return { ok: false, reason: 'Comments between imports are not supported yet.' };
	}

	const indent = lines[firstImport].match(/^[\t ]*/)?.[0] ?? '';

	const parsed: ParsedImport[] = [];
	for (const i of importLineIndices) {
		const text = lines[i];
		if (!hasBalancedBraces(text)) {
			return { ok: false, reason: 'Multi-line imports are not supported yet.' };
		}
		if (isSideEffectImport(text)) {
			return {
				ok: false,
				reason: 'Side-effect imports present; not reordering to preserve evaluation order.'
			};
		}
		const imp = parseImport(text);
		if (!imp) {
			return { ok: false, reason: 'Could not safely parse the imports; leaving them untouched.' };
		}
		parsed.push(imp);
	}

	const emitted = parsed.map((imp) => `${indent}${emitImport(imp)}`);
	const deduped = dedupe(
		[...emitted.keys()]
			.sort((a, b) => compareImport(parsed[a], parsed[b], emitted[a], emitted[b]))
			.map((index) => emitted[index])
	);
	const newText = deduped.join('\n');

	const originalText = lines.slice(firstImport, lastImport + 1).join('\n');
	if (newText === originalText) {
		return { ok: false, reason: 'Imports are already organized.' };
	}

	return { ok: true, startLine: firstImport, endLine: lastImport, newText };
}

/**
 * Organize the editor's leading import block as a SINGLE undo step. On refusal
 * the editor is untouched and the reason is returned.
 */
export function organizeImportsAt(editor: EditorState): OrganizeImportsResult {
	const plan = planOrganizeImports({
		lines: editor.lines.map((line) => ({ text: line.text })),
		language: editor.language
	});
	if (!plan.ok) return plan;

	const endCol = editor.getLine(plan.endLine)?.text.length ?? 0;
	editor.transact((tx) => {
		tx.delete({ line: plan.startLine, column: 0 }, { line: plan.endLine, column: endCol });
		tx.insert({ line: plan.startLine, column: 0 }, plan.newText);
	});

	const lastLineLength = plan.newText.split('\n').at(-1)?.length ?? 0;
	const lastLine = plan.startLine + plan.newText.split('\n').length - 1;
	editor.setCursor({ line: lastLine, column: lastLineLength });
	return { ok: true };
}

function isCommentLine(text: string): boolean {
	const t = text.trim();
	return t.startsWith('//') || t.startsWith('/*') || t.startsWith('*');
}

function hasBalancedBraces(text: string): boolean {
	let brace = 0;
	for (const ch of text) {
		if (ch === '{') brace++;
		else if (ch === '}') brace--;
		if (brace < 0) return false;
	}
	return brace === 0;
}

function isSideEffectImport(text: string): boolean {
	return new RegExp(`^\\s*import\\s*(['"])[^'"]+\\1\\s*;?\\s*$`).test(text);
}

function parseImport(text: string): ParsedImport | null {
	const trimmed = text.trim().replace(/;\s*$/, '');

	const sourceMatch = trimmed.match(/\bfrom\s*(['"])([^'"]+)\1$/);
	if (!sourceMatch) return null;
	const quote = sourceMatch[1];
	const source = sourceMatch[2];

	let clause = trimmed.slice('import'.length, trimmed.length - sourceMatch[0].length).trim();
	if (clause.length === 0) return null; // `import from 'x'` is invalid

	// `import type { … }` / `import type Foo from …` / `import type * as ns` is
	// type-only. But `import type from 'x'` and `import type, { a }` are DEFAULT
	// imports named `type`, so only treat it as type-only when `type` is followed
	// by a real clause start (`{`, `*`, or an identifier) — NOT a comma.
	let typeOnly = false;
	if (/^type\s+[{*A-Za-z_$]/.test(clause)) {
		typeOnly = true;
		clause = clause.replace(/^type\s+/, '').trim();
	}

	let named: NamedSpecifier[] | undefined;
	const braceMatch = clause.match(/\{([^}]*)\}/);
	if (braceMatch) {
		const parsedNamed = parseNamed(braceMatch[1]);
		if (!parsedNamed) return null;
		named = parsedNamed;
		const at = braceMatch.index ?? 0;
		clause = (clause.slice(0, at) + clause.slice(at + braceMatch[0].length)).trim();
		clause = clause.replace(/^,|,$/g, '').trim();
	}

	let defaultImport: string | undefined;
	let namespace: string | undefined;
	const remainders = clause
		.split(',')
		.map((part) => part.trim())
		.filter(Boolean);
	for (const part of remainders) {
		const nsMatch = part.match(new RegExp(`^\\*\\s+as\\s+(${IDENT})$`));
		if (nsMatch) {
			if (namespace) return null; // two namespace clauses is invalid
			namespace = nsMatch[1];
			continue;
		}
		if (new RegExp(`^${IDENT}$`).test(part)) {
			if (defaultImport) return null; // `import A, B from …` is invalid JS
			defaultImport = part;
			continue;
		}
		return null; // unrecognized clause fragment
	}

	if (!defaultImport && !namespace && !named) return null;
	// A namespace import cannot be combined with a named clause (`* as ns, { a }`
	// and `d, * as ns, { a }` are SyntaxErrors). Refuse rather than re-emit them.
	if (namespace && named) return null;

	return { source, quote, typeOnly, defaultImport, namespace, named };
}

function parseNamed(inner: string): NamedSpecifier[] | null {
	const specs: NamedSpecifier[] = [];
	for (const raw of inner.split(',')) {
		const spec = raw.trim();
		if (spec.length === 0) continue;

		let body = spec;
		let typeOnly = false;
		const typeMatch = body.match(new RegExp(`^type\\s+(.*)$`));
		if (typeMatch) {
			typeOnly = true;
			body = typeMatch[1].trim();
		}

		const aliasMatch = body.match(new RegExp(`^(${IDENT})\\s+as\\s+(${IDENT})$`));
		if (aliasMatch) {
			specs.push({ name: aliasMatch[1], alias: aliasMatch[2], typeOnly });
			continue;
		}
		if (new RegExp(`^${IDENT}$`).test(body)) {
			specs.push({ name: body, typeOnly });
			continue;
		}
		return null;
	}
	return specs;
}

function emitImport(imp: ParsedImport): string {
	const parts: string[] = [];
	if (imp.defaultImport) parts.push(imp.defaultImport);
	if (imp.namespace) parts.push(`* as ${imp.namespace}`);
	if (imp.named) {
		const specs = [...imp.named]
			.sort((a, b) => compareName(a.name, b.name))
			.map((n) => `${n.typeOnly ? 'type ' : ''}${n.name}${n.alias ? ` as ${n.alias}` : ''}`);
		// An import with ONLY an empty `{}` is preserved as `{}` (valid, rare).
		parts.push(`{ ${specs.join(', ')} }`);
	}
	const clause = parts.join(', ');
	return `import ${imp.typeOnly ? 'type ' : ''}${clause} from ${imp.quote}${imp.source}${imp.quote};`;
}

function compareName(a: string, b: string): number {
	return a.toLowerCase().localeCompare(b.toLowerCase()) || a.localeCompare(b);
}

function compareImport(a: ParsedImport, b: ParsedImport, aLine: string, bLine: string): number {
	return compareName(a.source, b.source) || aLine.localeCompare(bLine);
}

function dedupe(sortedLines: string[]): string[] {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const line of sortedLines) {
		if (seen.has(line)) continue;
		seen.add(line);
		out.push(line);
	}
	return out;
}
