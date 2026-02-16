// @ts-check
/** @type {import('../../testcases').Meta} */
export default {
  options: {},
  rollupOptions: {
    input : {
      "main-foo": "foo.d.ts",
      "main-bar": "bar.d.ts",
      "main-baz/index": "baz/index.d.ts"
    }
  },
};
