import * as rollup from "rollup";
import fs from "fs";
import path from "path";
import dts from "../";

const TESTCASES = path.join(__dirname, "testcases");

async function assertTestcase(dir: string) {
  const bundle = await rollup.rollup({
    input: path.join(dir, "index.ts"),
    plugins: [dts()],
  });

  const { code } = await bundle.generate({
    format: "es",
    // TODO: enable source maps at some point…
    // sourcemap: true,
    // sourcemapExcludeSources: true,
  });

  expect(code.trim()).toMatchSnapshot();
}

describe("rollup-plugin-dts", () => {
  const dirs = fs.readdirSync(TESTCASES);
  for (let name of dirs) {
    const dir = path.join(TESTCASES, name);
    if (fs.statSync(dir).isDirectory()) {
      let testfn = it;
      if (name.startsWith("skip.")) {
        name = name.substr("skip.".length);
        testfn = it.skip;
      }
      testfn(`works for testcase "${name}"`, () => {
        return assertTestcase(dir);
      });
    }
  }
});
