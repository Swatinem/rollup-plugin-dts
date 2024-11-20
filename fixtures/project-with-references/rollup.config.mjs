import dts from 'rollup-plugin-dts'

export default /** @type {import('rollup').RollupOptions} */ ({
  input: 'client/index.ts',
  output: {
    dir: 'dist',
    format: 'esm',
  },
  plugins: [
    dts()
  ]
})
