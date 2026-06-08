// @ts-check
/** @type {import('../../testcases').Meta} */
export default {
  downstream: [
    {
      consumer: "consumer.ts",
      expectedDts: "expected-consumer.d.ts",
    },
  ],
  options: {},
  rollupOptions: {},
};
