// @ts-check
/** @type {import('../../testcases').Meta} */
export default {
  options: {},
  // `./utils` resolves to utils/index.d.ts, which is bundled into the entry
  // chunk — the specifier must be rewritten to the chunk, with no warning
  expectedWarnings: [],
  rollupOptions: {
    // alias the entry so the chunk is named `index.d.ts` (not `index.d.d.ts`)
    // and the rewritten specifier reads `./index`
    input: { index: "index.d.ts" },
  },
};
