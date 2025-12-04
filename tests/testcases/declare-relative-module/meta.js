const options = {
  rollupOptions: {
    input: {
      // The sanity check creates another bundle with `expected.d.ts` as the
      // input file name. This results in a chunk name of `expected.d.d.ts` as
      // rollup will first strip extname (i.e. `.ts`) and then add `.d.ts`
      // again. This results in a module name of `./expected.d`. To make sure
      // both, the initial bundle and the sanity check bundle, have the same
      // module names, we need to explicitly set the chunk name to
      // `expected.d` here.
      'expected.d': 'index.d.ts'
    }
  }
};

export default options;
