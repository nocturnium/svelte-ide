import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * No raw control bytes in source.
 *
 * Written because a raw 0x00 reached `main` inside a template literal, and every
 * gate this repository has passed over it: prettier, eslint, svelte-check across
 * 701 files, and 4119 tests. The byte was semantically harmless — it produced
 * exactly the string the escape sequence would have — which is why nothing
 * flagged it.
 *
 * What it broke was every tool that reads source as text. `file(1)` reported the
 * module as `data` rather than JavaScript; `grep` treated it as binary and
 * returned nothing, silently, for symbols that were plainly there; and `git diff`
 * showed `-` instead of a line count, so the file was invisible in review. A
 * module that cannot be grepped is a module the next engineer cannot find.
 *
 * The intended spelling is the escape sequence — `\x00` as four characters —
 * which compiles to the identical runtime value while leaving the file readable.
 */

const SRC = join(process.cwd(), 'src');

/**
 * Bytes that must never appear literally. Tab (0x09), newline (0x0A) and
 * carriage return (0x0D) are legitimate whitespace and excluded; everything else
 * below 0x20, plus DEL, belongs in an escape sequence.
 */
const FORBIDDEN = new Set([
	...Array.from({ length: 9 }, (_, i) => i), // 0x00-0x08
	...Array.from({ length: 21 }, (_, i) => i + 11), // 0x0B-0x1F, minus 0x0D below
	0x7f
]);
FORBIDDEN.delete(0x0d);

function listFiles(dir: string): string[] {
	const out: string[] = [];
	for (const entry of readdirSync(dir)) {
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) out.push(...listFiles(full));
		else if (/\.(ts|js|svelte|css)$/.test(entry)) out.push(full);
	}
	return out;
}

describe('source hygiene', () => {
	const files = listFiles(SRC);

	it('sweeps a meaningful number of files', () => {
		// Guards the guard: a broken walk would pass the assertion below vacuously.
		expect(files.length).toBeGreaterThan(200);
	});

	it('contains no raw control bytes', () => {
		const offenders: string[] = [];

		for (const file of files) {
			const bytes = readFileSync(file);
			let line = 1;
			for (let i = 0; i < bytes.length; i++) {
				const byte = bytes[i];
				if (byte === 0x0a) {
					line++;
					continue;
				}
				if (FORBIDDEN.has(byte)) {
					const hex = byte.toString(16).padStart(2, '0');
					offenders.push(
						`${file.slice(SRC.length + 1)}:${line} — raw 0x${hex}; write it as \\x${hex} instead`
					);
				}
			}
		}

		expect(offenders, `${offenders.length} raw control byte(s):\n${offenders.join('\n')}`).toEqual(
			[]
		);
	});
});
