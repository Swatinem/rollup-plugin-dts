// @ts-check
/** @type {import('../../testcases').Meta} */
export default {
  options: {},
  rollupOptions: {
    input: ["main-a.d.ts", "main-b.d.ts"],
    output: {
      entryFileNames: "[name].d.mts",
      chunkFileNames: "[name]-[hash].d.mts",
    },
  },
  rollupVersion: "4.44.0",
};
