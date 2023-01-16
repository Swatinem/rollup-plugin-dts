import * as assert from "assert";
import fs from "fs/promises";
import * as path from "path";
import { InputOption, InputOptions, rollup, RollupOptions, RollupOutput } from "rollup";
import ts from "typescript";
import dts, { Options } from "../src/index.js";
import { exists, forEachFixture, Harness } from "./utils.js";

export default (t: Harness) => {
  forEachFixture("testcases", (name, dir) => {
    t.test(`testcases/${name}`, async (bless) => {
      const rollupOptions: InputOptions = {
        input: (await exists(path.join(dir, "index.d.ts"))) ? "index.d.ts" : "index.ts",
      };
      const meta: Meta = {
        options: {},
        skip: false,
        rollupOptions,
      };
      try {
        Object.assign(meta, (await import("file://" + path.join(dir, "meta.js"))).default);
        meta.rollupOptions = Object.assign(rollupOptions, meta.rollupOptions);
      } catch {}

      if (meta.tsVersion) {
        const [major, minor] = ts.versionMajorMinor.split(".").map(Number);
        const [reqMajor, reqMinor] = meta.tsVersion.split(".").map(Number);
        if (major! < reqMajor! || minor! < reqMinor!) {
          // skip unsupported version
          return;
        }
      }

      if (!meta.skip) {
        return assertTestcase(dir, meta, bless);
      }
    });
  });
};

interface Meta {
  options: Options;
  rollupOptions: RollupOptions;
  skip: boolean;
  expectedError?: string;
  tsVersion?: string;
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
    sourcemap: false,
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
    mapped[alias] = path.join(dir, input![alias]!);
  }
  return mapped;
}

function clean(code: string = "") {
  return (
    code
      .trim()
      // skip blank lines
      .replace(/\n+/gm, "\n") + "\n"
  );
}

async function assertTestcase(dir: string, meta: Meta, bless: boolean) {
  const { expectedError, options, rollupOptions } = meta;

  const input = withInput(dir, rollupOptions);
  const creator = createBundle(options, { ...rollupOptions, input });
  let output!: RollupOutput["output"];
  let error!: Error;

  try {
    ({ output } = await creator);
  } catch (e) {
    error = e as any;
    if (!expectedError) {
      throw e;
    }
  }
  if (expectedError) {
    assert.strictEqual(error.message, expectedError);
    return;
  }

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
  const hasExpected = await exists(expectedDts);
  // const expectedMap = path.join(dir, "expected.d.ts.map");
  if (!hasExpected || bless) {
    await fs.writeFile(expectedDts, code);
    // await fsExtra.writeFile(expectedMap, map);
  }

  const expectedCode = await fs.readFile(expectedDts, "utf-8");
  assert.strictEqual(code, expectedCode);
  // expect(String(map)).toEqual(await fsExtra.readFile(expectedMap, "utf-8"));

  if (hasExpected && !hasMultipleOutputs) {
    const {
      output: [sanityCheck],
    } = await createBundle(options, { ...rollupOptions, input: expectedDts });

    // typescript `.d.ts` output compresses whitespace, so make sure we ignore that
    assert.strictEqual(clean(sanityCheck.code), expectedCode);
  }
}
