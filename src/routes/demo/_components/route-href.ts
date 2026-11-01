import { resolve } from '$app/paths';
import type { RouteId } from '$app/types';

/**
 * Resolve a route id taken from data (nav lists, demo cards) to a URL that includes
 * the deployed base path. `resolve()` types its argument per route, so it cannot take
 * a union of route ids directly; the cast lives here once. Callers still type their
 * hrefs as `RouteId`, so a renamed or mistyped route fails `svelte-check`.
 *
 * Only use this for routes without params (all the demo pages).
 */
export function routeHref(route: RouteId): string {
	return resolve(route as '/');
}
