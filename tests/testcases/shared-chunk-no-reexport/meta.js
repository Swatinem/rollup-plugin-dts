// @ts-check
/** @type {import('../../testcases').Meta} */
export default {
  options: {},
  expectedWarnings: [
    'Entry "entry-a.d.ts" still references private shared type exports with no public re-export: Shared. rollup-plugin-dts will not invent new public exports for these types. Re-export them from a public entry to avoid downstream TS2742 errors.',
    'Entry "entry-b.d.ts" still references private shared type exports with no public re-export: Shared. rollup-plugin-dts will not invent new public exports for these types. Re-export them from a public entry to avoid downstream TS2742 errors.',
  ],
  downstream: [
    {
      consumer: "consumer-entry-a.ts",
      expectedErrorIncludes: ["error TS2742", "shared.d-"],
    },
    {
      consumer: "consumer-entry-b.ts",
      expectedErrorIncludes: ["error TS2742", "shared.d-"],
    },
  ],
  rollupOptions: {
    input: ["entry-a.d.ts", "entry-b.d.ts"],
  },
};
