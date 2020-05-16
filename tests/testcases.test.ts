import { rollup, InputOption, RollupOptions, InputOptions } from "rollup";
import dts, { Options } from "../src";
import fsExtra from "fs-extra";
import path from "path";

const TESTCASES = path.join(__dirname, "testcases");

interface Meta {
  options: Options;
  rollupOptions: RollupOptions;
  skip: boolean;
  expectedError?: string;
}

async function createBundle(options: Options, rollupOptions: RollupOptions) {
  const bundle = await rollup({
    ...rollupOptions,
    plugins: [dts(options)],
    onwarn() {},
  });
  return bundle.generate({
    ...rollupOptions.output,
    format: "es",
    // sourcemap: true,
    sourcemapExcludeSources: true,
  });
}

function withInput(dir: string, { input }: InputOptions): InputOption {
  if (typeof input === "string") {
    return path.join(dir, input);
  }
  if (Array.isArray(input)) {
    return input.map((input) => path.join(dir, input));
  }
  const mapped: { [alias: string]: string } = {};
  for (const alias of Object.keys(input!)) {
    mapped[alias] = path.join(dir, input![alias]);
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
  const { expectedError, options, rollupOptions } = meta;

  const creator = createBundle(options, { ...rollupOptions, input: withInput(dir, rollupOptions) });
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
      if (file.type === "chunk") {
        code += `// ${file.fileName}\n${clean(file.code)}`;
      }
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
    } = await createBundle(options, { ...rollupOptions, input: expectedDts });
    // typescript `.d.ts` output compresses whitespace, so make sure we ignore that
    expect(clean(sanityCheck.code)).toEqual(expectedCode);
  }
}

describe("rollup-plugin-dts", () => {
  const dirs = fsExtra.readdirSync(TESTCASES);
  for (const name of dirs) {
    const dir = path.join(TESTCASES, name);
    if (fsExtra.statSync(dir).isDirectory()) {
      const rollupOptions: InputOptions = {
        input: fsExtra.pathExistsSync(path.join(dir, "index.d.ts")) ? "index.d.ts" : "index.ts",
      };
      const meta: Meta = {
        options: {},
        skip: false,
        rollupOptions,
      };
      try {
        Object.assign(meta, require(path.join(dir, "meta")));
        meta.rollupOptions = Object.assign(rollupOptions, meta.rollupOptions);
      } catch {}

      let testfn = meta.skip ? it.skip : it;
      testfn(`works for testcase "${name}"`, () => {
        return assertTestcase(dir, meta);
      });
    }
  }
});
