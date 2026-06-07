/**
 * Mock plugin-host Event Stream API
 * GET - SSE endpoint for real-time plugin updates
 */

import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	const stream = new ReadableStream({
		start(controller) {
			// Send initial connection message
			controller.enqueue(
				`data: ${JSON.stringify({ type: 'connected', timestamp: Date.now() })}\n\n`
			);

			// Send periodic heartbeat
			const heartbeat = setInterval(() => {
				try {
					controller.enqueue(
						`data: ${JSON.stringify({ type: 'heartbeat', timestamp: Date.now() })}\n\n`
					);
				} catch {
					clearInterval(heartbeat);
				}
			}, 30000);

			// Simulate some plugin events
			const events = [
				{ type: 'plugin:update', plugin: 'git-panel', status: 'updated' },
				{ type: 'proposal:new', proposalId: 'proposal-6', name: 'New Feature' },
				{ type: 'plugin:installed', plugin: 'dracula-theme' }
			];

			let eventIndex = 0;
			const eventTimer = setInterval(() => {
				if (eventIndex < events.length) {
					try {
						controller.enqueue(
							`data: ${JSON.stringify({ ...events[eventIndex], timestamp: Date.now() })}\n\n`
						);
						eventIndex++;
					} catch {
						clearInterval(eventTimer);
						clearInterval(heartbeat);
					}
				}
			}, 10000);
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive'
		}
	});
};
