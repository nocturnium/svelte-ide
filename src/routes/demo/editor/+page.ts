// The full editor demo is a heavy client-side app shell (live CustomEditor) —
// prerendering it adds no SEO value and the editor isn't server-renderable.
// Served via the SPA fallback like before.
export const ssr = false;
export const prerender = false;
