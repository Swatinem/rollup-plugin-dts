// @ts-check
import url from "url";
import path from "path";

/** @type {import('../../testcases').Meta} */
export default {
  options: {
    tsconfig: path.resolve(url.fileURLToPath(new URL(".", import.meta.url)), "tsconfig.build.json"),
  },
  rollupOptions: {},
};
