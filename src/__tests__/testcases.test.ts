import * as rollup from "rollup";
import fs from "fs";
import path from "path";
import dts from "../";
import { Meta, defaultMeta } from "./meta";

const TESTCASES = path.join(__dirname, "testcases");

async function assertTestcase(dir: string, meta: Meta) {
  const bundle = await rollup.rollup({
    input: path.join(dir, "index.ts"),
    plugins: [
      dts({
        logAst: meta.debug,
      }),
    ],
  });

  const { code } = await bundle.generate({
    format: "es",
    // TODO: enable source maps at some point…
    sourcemap: true,
    sourcemapExcludeSources: true,
  });

  // console.log(code);

  expect(code.trim()).toMatchSnapshot();
}

describe("rollup-plugin-dts", () => {
  const dirs = fs.readdirSync(TESTCASES);
  for (const name of dirs) {
    const dir = path.join(TESTCASES, name);
    if (fs.statSync(dir).isDirectory()) {
      const meta = defaultMeta();
      try {
        Object.assign(meta, require(path.join(dir, "meta.json")));
      } catch {}

      let testfn = meta.skip ? it.skip : it;
      testfn(`works for testcase "${name}"`, () => {
        return assertTestcase(dir, meta);
      });
    }
  }
});
