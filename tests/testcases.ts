import * as assert from "assert";
import fs from "fs/promises";
import * as path from "path";
import type { RollupOutput } from "rollup";
import { createBundle, isFixtureSupported, loadFixtureMeta, type Meta, withInput } from "./fixture-helpers.js";
import { exists, forEachFixture, Harness } from "./utils.js";

export default (t: Harness) => {
  forEachFixture("testcases", (name, dir) => {
    t.test(`testcases/${name}`, async (bless) => {
      const meta = await loadFixtureMeta(dir);

      if (meta.skip || !isFixtureSupported(meta)) {
        return;
      }

      return assertTestcase(dir, meta, bless);
    });
  });
};

/**
 * Replace Rollup's content hashes in chunk filenames with stable sequential
 * placeholders so snapshot assertions work across Rollup versions.
 *
 * e.g. `shared.d-BwjD5eaf.js` → `shared.d-HASH1.js`
 */
function normalizeChunkHashes(code: string): string {
  const seen = new Map<string, string>();
  return code.replace(/-[A-Za-z0-9_-]{8}\./g, (match) => {
    let placeholder = seen.get(match);
    if (!placeholder) {
      placeholder = `-HASH${seen.size + 1}.`;
      seen.set(match, placeholder);
    }
    return placeholder;
  });
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
  const { expectedError, expectedWarnings, options, rollupOptions } = meta;

  const input = withInput(dir, rollupOptions);
  const creator = createBundle(options, { ...rollupOptions, input });
  let output!: RollupOutput["output"];
  let warnings!: string[];
  let error!: Error;

  try {
    ({ output, warnings } = await creator);
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

  if (expectedWarnings) {
    assert.deepStrictEqual([...warnings].sort(), [...expectedWarnings].sort());
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
  assert.strictEqual(normalizeChunkHashes(code), normalizeChunkHashes(expectedCode));
  // expect(String(map)).toEqual(await fsExtra.readFile(expectedMap, "utf-8"));

  if (hasExpected && !hasMultipleOutputs) {
    const {
      output: [sanityCheck],
    } = await createBundle(options, { ...rollupOptions, input: expectedDts });

    // typescript `.d.ts` output compresses whitespace, so make sure we ignore that
    assert.strictEqual(normalizeChunkHashes(clean(sanityCheck.code)), normalizeChunkHashes(expectedCode));
  }

}
