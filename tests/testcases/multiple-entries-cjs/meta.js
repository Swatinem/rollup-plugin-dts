// @ts-check
/** @type {import('../../testcases').Meta} */
export default {
  options: {},
  rollupOptions: {
    input: ["main-a.d.ts", "main-b.d.ts"],
    output: { entryFileNames: "[name].d.cts" },
  },
  rollupVersion: '3.25.0',
};
