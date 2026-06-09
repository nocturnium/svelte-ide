import { describe, expect, it, vi } from 'vitest';

describe('CRDT optional peer dependencies', () => {
	it('does not evaluate yjs peers from the root or general editor barrels', async () => {
		vi.resetModules();
		vi.doMock('yjs', () => {
			throw new Error('yjs should not be imported by non-CRDT barrels');
		});
		vi.doMock('y-websocket', () => {
			throw new Error('y-websocket should not be imported by non-CRDT barrels');
		});
		vi.doMock('y-protocols/awareness', () => {
			throw new Error('y-protocols awareness should not be imported by non-CRDT barrels');
		});

		try {
			await expect(import('$lib/index')).resolves.toBeDefined();
			await expect(import('$lib/components/editor')).resolves.toBeDefined();
			await expect(import('$lib/crdt')).rejects.toThrow();
		} finally {
			vi.doUnmock('yjs');
			vi.doUnmock('y-websocket');
			vi.doUnmock('y-protocols/awareness');
		}
	});
});
