// Vitest setup: polyfill browser event globals missing on older Node versions.
//
// `CloseEvent` only became a Node.js global in Node 23; the LSP client's WebSocket
// mock constructs one, so on the supported Node 18–22 range (and CI's Node 22) it is
// otherwise undefined. `Event` and `MessageEvent` already exist on all supported
// versions, so only `CloseEvent` needs a shim.
if (typeof globalThis.CloseEvent === 'undefined') {
	class CloseEventPolyfill extends Event {
		readonly code: number;
		readonly reason: string;
		readonly wasClean: boolean;
		constructor(
			type: string,
			init: { code?: number; reason?: string; wasClean?: boolean } & EventInit = {}
		) {
			super(type, init);
			this.code = init.code ?? 0;
			this.reason = init.reason ?? '';
			this.wasClean = init.wasClean ?? false;
		}
	}
	globalThis.CloseEvent = CloseEventPolyfill as unknown as typeof CloseEvent;
}
