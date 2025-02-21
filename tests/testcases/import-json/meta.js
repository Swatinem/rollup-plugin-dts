// @ts-check
import url from "url";
import path from "path";

/** @type {import('../../testcases').Meta} */
export default {
  /**
   * TypeScript <5.1 will generate `declare const name: ...` for JSON modules,
   * instead of current `decalre let name: ...`.
   * But it doesn't matter, both can work.
   * I'll just omit the test results for TypeScript <5.1.
   */
  tsVersion: "5.1",
  options: {
    tsconfig: path.resolve(url.fileURLToPath(new URL(".", import.meta.url)), "tsconfig.json"),
  },
  rollupOptions: {},
};
