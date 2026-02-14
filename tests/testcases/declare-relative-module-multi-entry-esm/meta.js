// @ts-check
/** @type {import('../../testcases').Meta} */
export default {
  options: {},
  rollupOptions: {
    input: {
      foo: "foo.d.ts",
      bar: "bar.d.ts",
      "foobaz/index": "foobaz/index.d.ts",
    },
  },
};
