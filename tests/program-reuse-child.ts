import * as assert from "node:assert";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { rollup } from "rollup";
import ts from "typescript";
import dts from "../src/index.js";

const directory = process.argv[2];
assert.ok(directory, "Pass the fixture directory");
const config = ts.readConfigFile(path.join(directory, "tsconfig.json"), ts.sys.readFile);
assert.strictEqual(config.error, undefined);
const { options } = ts.parseJsonConfigFileContent(config.config, ts.sys, directory);
const bundle = await rollup({
  input: path.join(directory, "index.ts"),
  plugins: [
    {
      name: "fixture-declaration-resolver",
      resolveId(source, importer) {
        if (!importer) return null;
        return ts.resolveModuleName(source, importer, options, ts.sys).resolvedModule?.resolvedFileName ?? null;
      },
    },
    dts(),
  ],
});

try {
  const { output } = await bundle.generate({ format: "es" });
  assert.strictEqual(output.length, 1);
  const chunk = output[0];
  assert.ok(chunk && chunk.type === "chunk");
  const watchFiles = await Promise.all(bundle.watchFiles.map((file) => fs.realpath(file)));
  process.stdout.write(JSON.stringify({ code: chunk.code, watchFiles }) + "\n");
} finally {
  await bundle.close();
}
