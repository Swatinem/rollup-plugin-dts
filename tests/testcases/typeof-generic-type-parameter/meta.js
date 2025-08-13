// @ts-check
/** @type {import('../../testcases').Meta} */
export default {
  tsVersion: '4.8',
  options: {
    respectExternal: true,
  },

  rollupOptions: {
    external: ['./models', './test'],
  },
};
