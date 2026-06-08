// @ts-check
/** @type {import('../../testcases').Meta} */
export default {
  options: {},
  expectedWarnings: [
    'Entry "entry-a.d.ts" still references private shared type exports with no public re-export: Hidden. rollup-plugin-dts will not invent new public exports for these types. Re-export them from a public entry to avoid downstream TS2742 errors.',
  ],
  downstream: [
    {
      consumer: "consumer-entry-a.ts",
      expectedDts: "expected-consumer-entry-a.d.ts",
    },
    {
      consumer: "consumer-entry-h.ts",
      expectedErrorIncludes: ["error TS2742"],
    },
  ],
  rollupOptions: {
    input: ["entry-a.d.ts", "entry-b.d.ts"],
  },
  rollupVersion: "4.0.0",
};
