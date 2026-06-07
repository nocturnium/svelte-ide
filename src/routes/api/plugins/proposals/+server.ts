/**
 * Mock plugin-host Proposals API
 * GET - List all proposals
 * POST - Create a new proposal
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// Mock proposals store (in-memory for demo)
const mockProposals = new Map<string, MockProposal>();

interface MockProposal {
	id: string;
	name: string;
	description: string;
	type: 'panel' | 'command' | 'theme' | 'language';
	status: 'pending' | 'approved' | 'rejected' | 'installed';
	author: string;
	version: string;
	createdAt: string;
	implementation?: {
		componentPath?: string;
		code?: string;
	};
}

// Seed with sample proposals
function seedProposals() {
	if (mockProposals.size > 0) return;

	const samples: MockProposal[] = [
		{
			id: 'proposal-1',
			name: 'Git Integration Panel',
			description: 'A panel for viewing git status, staging changes, and committing',
			type: 'panel',
			status: 'approved',
			author: 'demo-user',
			version: '1.0.0',
			createdAt: new Date(Date.now() - 86400000).toISOString(),
			implementation: {
				componentPath: '/plugins/git-panel.svelte',
				code: `<script>
  let status = $state('clean');
</script>
<div class="git-panel">
  <h3>Git Status: {status}</h3>
  <button onclick={() => status = 'modified'}>Simulate Change</button>
</div>`
			}
		},
		{
			id: 'proposal-2',
			name: 'Terminal Emulator',
			description: 'Integrated terminal with xterm.js',
			type: 'panel',
			status: 'pending',
			author: 'demo-user',
			version: '0.1.0',
			createdAt: new Date(Date.now() - 3600000).toISOString()
		},
		{
			id: 'proposal-3',
			name: 'Format on Save',
			description: 'Automatically format code when saving files',
			type: 'command',
			status: 'approved',
			author: 'demo-user',
			version: '1.2.0',
			createdAt: new Date(Date.now() - 172800000).toISOString()
		},
		{
			id: 'proposal-4',
			name: 'Dracula Theme',
			description: 'Popular dark theme with vibrant colors',
			type: 'theme',
			status: 'installed',
			author: 'community',
			version: '2.0.0',
			createdAt: new Date(Date.now() - 604800000).toISOString()
		},
		{
			id: 'proposal-5',
			name: 'Rust Language Support',
			description: 'Syntax highlighting and snippets for Rust',
			type: 'language',
			status: 'pending',
			author: 'rust-community',
			version: '0.5.0',
			createdAt: new Date().toISOString()
		}
	];

	samples.forEach((p) => mockProposals.set(p.id, p));
}

export const GET: RequestHandler = async () => {
	seedProposals();

	const proposals = Array.from(mockProposals.values()).sort(
		(a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
	);

	return json({ proposals });
};

export const POST: RequestHandler = async ({ request }) => {
	seedProposals();

	try {
		const body = await request.json();

		const proposal: MockProposal = {
			id: `proposal-${Date.now()}`,
			name: body.name || 'Untitled Proposal',
			description: body.description || '',
			type: body.type || 'panel',
			status: 'pending',
			author: body.author || 'anonymous',
			version: body.version || '0.1.0',
			createdAt: new Date().toISOString(),
			implementation: body.implementation
		};

		mockProposals.set(proposal.id, proposal);

		return json({ success: true, proposal }, { status: 201 });
	} catch (err) {
		return json({ error: 'Invalid request body' }, { status: 400 });
	}
};
