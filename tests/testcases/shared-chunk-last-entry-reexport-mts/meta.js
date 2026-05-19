// @ts-check
/** @type {import('../../testcases').Meta} */
export default {
  options: {},
  expectedWarnings: [],
  downstream: [
    {
      consumer: "consumer-entry-a.ts",
      expectedDts: "expected-consumer-entry-a.d.ts",
    },
    {
      consumer: "consumer-entry-b.ts",
      expectedDts: "expected-consumer-entry-b.d.ts",
    },
  ],
  rollupOptions: {
    input: ["entry-a.d.ts", "entry-b.d.ts"],
    output: {
      entryFileNames: "[name].d.mts",
      chunkFileNames: "[name]-[hash].d.mts",
    },
  },
  rollupVersion: "4.44.0",
};
