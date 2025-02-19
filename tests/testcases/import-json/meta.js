// @ts-check
import url from "url";
import path from "path";

/** @type {import('../../testcases').Meta} */
export default {
  options: {
    tsconfig: path.resolve(url.fileURLToPath(new URL(".", import.meta.url)), "tsconfig.json"),
  },
  rollupOptions: {
    plugins: [json()]
  },
};

/**
 * Rollup plugin to transform JSON files into ES modules,
 * you may want to use `@rollup/plugin-json` instead.
 */
function json() {
  return {
    name: 'json',
    transform(code, id) {
      if (!id.endsWith('.json')) return null;

      const parsed = JSON.parse(code);
      return `export default ${JSON.stringify(parsed, null, 2)};`
    }
  };
}
