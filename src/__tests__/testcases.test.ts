import { rollup, RollupOptions } from "rollup";
import { dts } from "../";
import fsExtra from "fs-extra";
import path from "path";

const ROOT = path.join(__dirname, "..", "..");
const TESTCASES = path.join(__dirname, "testcases");

interface BundleOptions extends Partial<RollupOptions> {
  tsconfig?: string;
}
interface Meta extends BundleOptions {
  rootFile: string;
  skip: boolean;
}

async function createBundle(input: string, options: BundleOptions) {
  const { tsconfig, ...rest } = options;
  const bundle = await rollup({
    ...rest,
    input,
    plugins: [dts({ tsconfig })],
  });
  return bundle.generate({
    format: "es",
    // sourcemap: true,
    sourcemapExcludeSources: true,
  });
}

function clean(code: string = "") {
  return (
    code
      .trim()
      // skip blank lines
      .replace(/\n+/gm, "\n")
      // ignore the banner
      .replace(/^\/\/ FILE GENERATED.+\n\/\/.+\n/m, "") + "\n"
  );
}

async function assertTestcase(dir: string, meta: Meta) {
  const { skip, rootFile, ...bundleOptions } = meta;
  if (bundleOptions.tsconfig && !path.isAbsolute(bundleOptions.tsconfig)) {
    bundleOptions.tsconfig = path.join(dir, bundleOptions.tsconfig);
  }
  // TODO(swatinem): also test the js bundling code :-)
  let {
    output: [{ code }],
  } = await createBundle(path.join(dir, rootFile), bundleOptions);

  code = clean(code);

  const expectedDts = path.join(dir, "expected.d.ts");
  const hasExpected = await fsExtra.pathExists(expectedDts);
  // const expectedMap = path.join(dir, "expected.d.ts.map");
  if (!hasExpected) {
    await fsExtra.writeFile(expectedDts, code);
    // await fsExtra.writeFile(expectedMap, map);
  }

  const expectedCode = await fsExtra.readFile(expectedDts, "utf-8");
  expect(code).toEqual(expectedCode);
  // expect(String(map)).toEqual(await fsExtra.readFile(expectedMap, "utf-8"));

  if (hasExpected) {
    const {
      output: [sanityCheck],
    } = await createBundle(expectedDts, bundleOptions);
    // typescript `.d.ts` output compresses whitespace, so make sure we ignore that
    expect(clean(sanityCheck.code)).toEqual(expectedCode);
  }
}

describe("rollup-plugin-dts", () => {
  const dirs = fsExtra.readdirSync(TESTCASES);
  for (const name of dirs) {
    const dir = path.join(TESTCASES, name);
    if (fsExtra.statSync(dir).isDirectory()) {
      const meta: Meta = {
        rootFile: "index.ts",
        skip: false,
        tsconfig: path.join(ROOT, "tsconfig.tests.json"),
      };
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
