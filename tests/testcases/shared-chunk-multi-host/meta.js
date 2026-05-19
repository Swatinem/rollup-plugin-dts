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
  ],
  rollupOptions: {
    input: ["entry-a.d.ts", "entry-b.d.ts", "entry-c.d.ts"],
  },
  rollupVersion: "4.0.0",
};
