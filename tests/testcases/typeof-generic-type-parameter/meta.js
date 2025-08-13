// @ts-check
/** @type {import('../../testcases').Meta} */
export default {
  tsVersion: "4.8",
  options: {
    respectExternal: true,
  },
  rollupOptions: {
    input: {
      index: "index.ts",
    },
    external: ["./models", "./test"],
  },
};
