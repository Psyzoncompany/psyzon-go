// The Vercel build replaces `cloudflare:workers` with this module. Runtime
// database access there uses Turso/libSQL; Vinext keeps the real D1 binding.
export const env: { DB?: D1Database } = {};

type D1Database = {
  prepare: (query: string) => unknown;
};
