import { resolve } from '$app/paths';
import type { RouteId, RouteParams } from '$app/types';

/** Route ids that take no params, which are the only ones `routeHref` accepts. */
export type StaticRouteId = {
	[K in RouteId]: RouteParams<K> extends Record<string, never> ? K : never;
}[RouteId];

/**
 * Resolve a route id taken from data (nav lists, demo cards) to a URL that includes
 * the deployed base path. `resolve()` types its argument per route, so it cannot take
 * a union of route ids directly; the cast lives here once. Callers type their hrefs
 * as `StaticRouteId`, so a renamed route or one that needs params fails `svelte-check`.
 */
export function routeHref(route: StaticRouteId): string {
	return resolve(route as '/');
}
