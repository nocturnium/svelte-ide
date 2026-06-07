/**
 * Mock plugin-host Submit Proposal API
 * POST - Submit a proposal for review/approval
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params }) => {
	const { id } = params;

	// Simulate processing delay
	await new Promise((resolve) => setTimeout(resolve, 500));

	// Mock success response
	return json({
		success: true,
		proposalId: id,
		status: 'approved',
		message: `Proposal ${id} has been approved and is ready for installation.`
	});
};
