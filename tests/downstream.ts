import * as assert from "assert";
import ts from "typescript";
import { assertDownstream } from "./downstream-helpers.js";
import { createBundle, isFixtureSupported, loadFixtureMeta, withInput } from "./fixture-helpers.js";
import { forEachFixture, Harness } from "./utils.js";

// Downstream consumer tests use --module NodeNext which requires TS 4.7+
const [tsMajor, tsMinor] = ts.versionMajorMinor.split(".").map(Number) as [number, number];
const supportsNodeNext = tsMajor > 4 || (tsMajor === 4 && tsMinor >= 7);

export default (t: Harness) => {
  forEachFixture("testcases", (name, dir) => {
    t.test(`downstream/${name}`, async (bless) => {
      const meta = await loadFixtureMeta(dir);

      if (!meta.downstream?.length || meta.skip) {
        return;
      }

      if (!isFixtureSupported(meta) || !supportsNodeNext) {
        return;
      }

      const { output, warnings } = await createBundle(meta.options, { ...meta.rollupOptions, input: withInput(dir, meta.rollupOptions) });
      if (meta.expectedWarnings) {
        assert.deepStrictEqual([...warnings].sort(), [...meta.expectedWarnings].sort());
      }
      await assertDownstream(dir, output, meta.downstream, bless);
    });
  });
};
