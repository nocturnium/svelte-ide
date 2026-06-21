// Collaboration uses Yjs/CRDT (a Y.Doc is created at component init), which is a
// client-only concern. Keep this route out of the prerender pass.
export const ssr = false;
export const prerender = false;
