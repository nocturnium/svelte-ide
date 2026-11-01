/**
 * True when running in a browser. A plain runtime check, so the library works
 * in any bundler or framework, not only SvelteKit (which is where
 * `$app/environment` would come from).
 */
export const browser = typeof window !== 'undefined' && typeof document !== 'undefined';
