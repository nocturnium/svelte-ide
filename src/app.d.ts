// See https://svelte.dev/docs/kit/types#app.d.ts for information about these interfaces.
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}

	// Injected by Vite `define` (see vite.config.ts) from package.json `version`.
	// Single source of truth for the version shown in the demo UI.
	const __APP_VERSION__: string;
}

export {};
