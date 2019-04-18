import { rollup, InputOption, RollupOptions } from "rollup";
import { dts } from "../src";
import fsExtra from "fs-extra";
import path from "path";

const TESTCASES = path.join(__dirname, "testcases");

interface BundleOptions extends Partial<RollupOptions> {
  tsconfig?: string;
}
interface Meta extends BundleOptions {
  input: InputOption;
  skip: boolean;
  expectedError?: string;
}

async function createBundle(input: InputOption, options: BundleOptions) {
  const { tsconfig, ...rest } = options;
  const bundle = await rollup({
    ...rest,
    input,
    plugins: [dts({ tsconfig, banner: false })],
  });
  return bundle.generate({
    format: "es",
    // sourcemap: true,
    sourcemapExcludeSources: true,
  });
}

function getInput(dir: string, input: InputOption): InputOption {
  if (typeof input === "string") {
    return path.join(dir, input);
  }
  if (Array.isArray(input)) {
    return input.map(input => path.join(dir, input));
  }
  const mapped: { [alias: string]: string } = {};
  for (const alias of Object.keys(input)) {
    mapped[alias] = path.join(dir, input[alias]);
  }
  return mapped;
}

export function clean(code: string = "") {
  return (
    code
      .trim()
      // skip blank lines
      .replace(/\n+/gm, "\n") + "\n"
  );
}

async function assertTestcase(dir: string, meta: Meta) {
  const { skip, input, expectedError, ...bundleOptions } = meta;
  if (bundleOptions.tsconfig && !path.isAbsolute(bundleOptions.tsconfig)) {
    bundleOptions.tsconfig = path.join(dir, bundleOptions.tsconfig);
  }

  // TODO(swatinem): also test the js bundling code :-)
  const creator = createBundle(getInput(dir, input), bundleOptions);
  if (expectedError) {
    await expect(creator).rejects.toThrow(expectedError);
    return;
  }
  const { output } = await creator;

  const hasMultipleOutputs = output.length > 1;
  let code = clean(output[0].code);
  if (hasMultipleOutputs) {
    code = "";
    for (const file of output) {
      code += `// ${file.fileName}\n${clean(file.code)}`;
    }
  }

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

  if (hasExpected && !hasMultipleOutputs) {
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
        input: "index.ts",
        skip: false,
        tsconfig: path.join(TESTCASES, "tsconfig.json"),
      };
      try {
        Object.assign(meta, require(path.join(dir, "meta")));
      } catch {}

      let testfn = meta.skip ? it.skip : it;
      testfn(`works for testcase "${name}"`, () => {
        return assertTestcase(dir, meta);
      });
    }
  }
});
