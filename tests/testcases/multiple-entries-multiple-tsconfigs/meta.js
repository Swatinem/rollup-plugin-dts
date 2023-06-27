// @ts-check
/** @type {import('../../testcases').Meta} */
export default {
  options: {},
  rollupOptions: {
    input: [
      "packages/packi/index.ts",
      "packages/packi/src/entries/entry-a.ts",
      "packages/packi/src/entries/entry-b.ts",
    ],
    output: {
      entryFileNames: "[name].d.ts",
    },
  },
  rollupVersion: '3.25.0',
};
