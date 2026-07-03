// @ts-check
/** @type {import('../../testcases').Meta} */
export default {
  options: {},
  // the type-only export fix inside the namespace shortens/lengthens the chunk
  // text before the declare module statement — the specifier rewrite must not
  // shift (TypeOnlyFixer edits and this rewrite share one MagicString, and all
  // offsets must stay in the original string's coordinate space)
  expectedWarnings: [],
  rollupOptions: {
    input: { index: "index.d.ts" },
  },
};
