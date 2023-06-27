// @ts-check
/** @type {import('../../testcases').Meta} */
export default {
  tsVersion: "4.8",
  options: {},
  rollupOptions: {
    input: {
      mts: "main-a.mts",
      cts: "main-b.cts",
    },
  },
  rollupVersion: '3.25.0',
};
