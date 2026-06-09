import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { Awareness } from 'y-protocols/awareness';
import { createAwarenessProtocol } from './awareness';

describe('createAwarenessProtocol', () => {
	it('writes cursor and selection presence to provider-attached awareness', () => {
		const doc = new Y.Doc();
		const provider = {
			awareness: new Awareness(doc)
		};

		const protocol = createAwarenessProtocol(provider.awareness);

		expect(protocol.awareness).toBe(provider.awareness);

		protocol.setUser({ id: 'u1', name: 'Ada', color: '#60a5fa' });
		protocol.setCursor(4, 7);
		protocol.setSelection(4, 12);
		protocol.setViewingFile('/src/main.ts');

		expect(provider.awareness.getLocalState()).toEqual({
			user: { id: 'u1', name: 'Ada', color: '#60a5fa' },
			state: 'active',
			cursor: { anchor: 4, head: 7 },
			selection: { anchor: 4, head: 12 },
			viewingFile: '/src/main.ts'
		});

		protocol.destroy();
		provider.awareness.destroy();
		doc.destroy();
	});
});
