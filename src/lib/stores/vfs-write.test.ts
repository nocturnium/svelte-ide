/**
 * writeFileOptimistic against a mocked VFS client: which errors are retried,
 * whether writes to one path stay in order, and whether a failed save keeps
 * the file marked unsaved.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/services/vfs-client', () => ({
	getWorkspace: vi.fn(),
	quickWriteFile: vi.fn(),
	deleteFile: vi.fn(),
	getConfig: () => ({ baseUrl: '/api/vfs' }),
	configure: vi.fn()
}));

import * as vfsClient from '$lib/services/vfs-client';
import * as vfs from './vfs.svelte';
import { VFSError } from '$lib/types';

describe('writeFileOptimistic: retries, ordering and dirty state', () => {
	async function setup() {
		vi.useFakeTimers();
		vfs.reset();
		vi.stubGlobal(
			'EventSource',
			class {
				close() {}
				addEventListener() {}
			}
		);
		vi.mocked(vfsClient.getWorkspace).mockResolvedValue({
			id: 'ws-w',
			name: 'w'
		} as never);
		await vfs.loadWorkspace('ws-w');
	}

	afterEach(() => {
		vi.useRealTimers();
	});

	it('does not retry a version conflict and queues it at once', async () => {
		await setup();
		vi.mocked(vfsClient.quickWriteFile).mockReset();
		vi.mocked(vfsClient.quickWriteFile).mockRejectedValue(
			new VFSError('Version conflict', 'VERSION_CONFLICT')
		);
		const result = await vfs.writeFileOptimistic('/conflict.txt', 'local edit');
		expect(result.success).toBe(false);
		expect(vfsClient.quickWriteFile).toHaveBeenCalledTimes(1);
		expect(vfs.getConflictQueue().some((c) => c.path === '/conflict.txt')).toBe(true);
	});

	it('keeps the file dirty when the write fails', async () => {
		await setup();
		vi.mocked(vfsClient.quickWriteFile).mockReset();
		vi.mocked(vfsClient.quickWriteFile).mockRejectedValue(
			new VFSError('Forbidden', 'PERMISSION_DENIED')
		);
		await vfs.writeFileOptimistic('/denied.txt', 'unsaved');
		expect(vfs.isDirty('/denied.txt')).toBe(true);
	});

	it('never lets an older retried write land after a newer one', async () => {
		await setup();
		vi.mocked(vfsClient.quickWriteFile).mockReset();
		const landed: string[] = [];
		let failFirst = true;
		vi.mocked(vfsClient.quickWriteFile).mockImplementation(async (_w, p, content) => {
			if (content === 'v1' && failFirst) {
				failFirst = false;
				throw new VFSError('boom', 'SERVER_ERROR');
			}
			landed.push(content as string);
			return { path: p, name: 'b.txt', isDir: false, size: 2, modTime: 'x' } as never;
		});
		const first = vfs.writeFileOptimistic('/order.txt', 'v1');
		const second = vfs.writeFileOptimistic('/order.txt', 'v2');
		await vi.runAllTimersAsync();
		await Promise.all([first, second]);
		expect(landed.at(-1)).toBe('v2');
		expect(landed).not.toContain('v1');
		expect(vfs.isDirty('/order.txt')).toBe(false);
	});
});

describe('writeFileOptimistic and deleteFileOptimistic: result and ordering (review round 2)', () => {
	async function setup() {
		vi.useFakeTimers();
		vfs.reset();
		vi.stubGlobal(
			'EventSource',
			class {
				close() {}
				addEventListener() {}
			}
		);
		vi.mocked(vfsClient.getWorkspace).mockResolvedValue({ id: 'ws-o', name: 'o' } as never);
		await vfs.loadWorkspace('ws-o');
		vi.mocked(vfsClient.quickWriteFile).mockReset();
		vi.mocked(vfsClient.deleteFile).mockReset();
	}

	afterEach(() => {
		vi.useRealTimers();
	});

	it('reports a superseded write with the outcome of the write that replaced it', async () => {
		await setup();
		vi.mocked(vfsClient.quickWriteFile).mockImplementation(async (_w, p, content) => {
			if (content === 'v2') throw new VFSError('Forbidden', 'PERMISSION_DENIED');
			return { path: p, name: 'a.txt', isDir: false, size: 2, modTime: 'x' } as never;
		});
		const first = vfs.writeFileOptimistic('/sup.txt', 'v1');
		const second = vfs.writeFileOptimistic('/sup.txt', 'v2');
		await vi.runAllTimersAsync();
		const [r1, r2] = await Promise.all([first, second]);

		expect(vfsClient.quickWriteFile).toHaveBeenCalledTimes(1);
		expect(r2.success).toBe(false);
		expect(r1.success).toBe(false);
		expect(vfs.isDirty('/sup.txt')).toBe(true);
	});

	it('still reports success for both calls when the newer write lands', async () => {
		await setup();
		vi.mocked(vfsClient.quickWriteFile).mockImplementation(
			async (_w, p) => ({ path: p, name: 'a.txt', isDir: false, size: 2, modTime: 'x' }) as never
		);
		const first = vfs.writeFileOptimistic('/ok.txt', 'v1');
		const second = vfs.writeFileOptimistic('/ok.txt', 'v2');
		await vi.runAllTimersAsync();
		const [r1, r2] = await Promise.all([first, second]);
		expect(r1.success).toBe(true);
		expect(r2.success).toBe(true);
		expect(vfsClient.quickWriteFile).toHaveBeenCalledTimes(1);
	});

	it('sends a delete after a slower write to the same path', async () => {
		await setup();
		const order: string[] = [];
		vi.mocked(vfsClient.quickWriteFile).mockImplementation(async (_w, p, content) => {
			await new Promise((r) => setTimeout(r, 500));
			order.push('write:' + content);
			return { path: p, name: 'd', isDir: false, size: 1, modTime: 'x' } as never;
		});
		vi.mocked(vfsClient.deleteFile).mockImplementation(async () => {
			order.push('delete');
		});
		const write = vfs.writeFileOptimistic('/d.txt', 'x');
		const del = vfs.deleteFileOptimistic('/d.txt');
		await vi.runAllTimersAsync();
		await Promise.all([write, del]);
		expect(order).toEqual(['write:x', 'delete']);
	});

	it('runs a delete for another path without waiting', async () => {
		await setup();
		const order: string[] = [];
		vi.mocked(vfsClient.quickWriteFile).mockImplementation(async (_w, p) => {
			await new Promise((r) => setTimeout(r, 500));
			order.push('write');
			return { path: p, name: 'd', isDir: false, size: 1, modTime: 'x' } as never;
		});
		vi.mocked(vfsClient.deleteFile).mockImplementation(async () => {
			order.push('delete');
		});
		const write = vfs.writeFileOptimistic('/a.txt', 'x');
		const del = vfs.deleteFileOptimistic('/b.txt');
		await vi.runAllTimersAsync();
		await Promise.all([write, del]);
		expect(order).toEqual(['delete', 'write']);
	});
});
