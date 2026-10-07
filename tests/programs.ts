import * as assert from "assert";
import fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { createPrograms } from "../src/program.js";
import { Harness } from "./utils.js";

export default (t: Harness) => {
  // All inputs share one tsconfig, so they must share one program. Before the fix, a
  // tsconfig cache hit returned the input's own directory, and every change of input
  // directory started a new program that type-checked the shared files again.
  t.test("programs/one-program-per-tsconfig", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "rollup-plugin-dts-programs-"));
    try {
      await fs.writeFile(path.join(root, "tsconfig.json"), JSON.stringify({ compilerOptions: { strict: true } }));
      const inputs = ["src/a/one.ts", "src/a/two.ts", "src/b/three.ts", "src/a/four.ts"].map((file) =>
        path.join(root, file),
      );
      for (const input of inputs) {
        await fs.mkdir(path.dirname(input), { recursive: true });
        await fs.writeFile(input, `export const value = ${JSON.stringify(path.basename(input))};\n`);
      }

      const programs = createPrograms(inputs, {});

      assert.strictEqual(programs.length, 1);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
};
