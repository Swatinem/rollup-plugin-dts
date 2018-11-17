import { rollup } from "rollup";
import dts from "../";
import fsExtra from "fs-extra";
import path from "path";
import { Meta, defaultMeta } from "./meta";

export const TESTCASES = path.join(__dirname, "testcases");

async function createBundle(input: string) {
  const bundle = await rollup({
    input,
    plugins: [dts({ tsconfig: TESTCASES })],
  });
  return bundle.generate({
    format: "es",
    // sourcemap: true,
    sourcemapExcludeSources: true,
  });
}

async function assertTestcase(dir: string, meta: Meta) {
  if (meta.debug) {
    debugger;
  }

  const { code } = await createBundle(path.join(dir, "index.ts"));

  const expectedDts = path.join(dir, "expected.ts");
  // const expectedMap = path.join(dir, "expected.ts.map");
  if (!(await fsExtra.pathExists(expectedDts))) {
    await fsExtra.writeFile(expectedDts, code);
    // await fsExtra.writeFile(expectedMap, map);
  }

  const expectedCode = await fsExtra.readFile(expectedDts, "utf-8");
  expect(code).toEqual(expectedCode);
  // expect(String(map)).toEqual(await fsExtra.readFile(expectedMap, "utf-8"));

  const sanityCheck = await createBundle(expectedDts);
  // typescript `.d.ts` output compresses whitespace, so make sure we ignore that
  const skipBlanks = (s: string) => s.replace(/\n+/gm, "\n");
  expect(skipBlanks(sanityCheck.code)).toEqual(skipBlanks(expectedCode));
}

describe("rollup-plugin-dts", () => {
  const dirs = fsExtra.readdirSync(TESTCASES);
  for (const name of dirs) {
    const dir = path.join(TESTCASES, name);
    if (fsExtra.statSync(dir).isDirectory()) {
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
