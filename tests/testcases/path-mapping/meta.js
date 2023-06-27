// @ts-check
import * as url from "url";
import * as path from "path";

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const compilerOptions = {
  baseUrl: __dirname,
  paths: { "components/*": ["foo/bar/*"] },
};

/** @type {import('../../testcases').Meta} */
export default {
  options: { compilerOptions },
  rollupOptions: {},
};
