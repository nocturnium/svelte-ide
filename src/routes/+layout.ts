// Prerender + SSR are ON by default so every content/demo page ships real HTML
// (per-route title, description, canonical, OG) that crawlers and social unfurlers
// can read. Heavy interactive routes (the editor/playground app shells and the
// Yjs/CRDT collaboration demos) opt out with their own `+page.ts`
// (`ssr = false; prerender = false`) and are served via the SPA fallback. The live
// editor previews inside DemoExhibit are client-islanded, so demo pages still
// prerender their chrome + the (static, tokenized) Code tab.
export const prerender = true;
export const ssr = true;
