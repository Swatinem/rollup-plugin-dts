import * as assert from "assert";
import { spawnSync } from "child_process";
import fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { Harness } from "./utils.js";

// The published bundles load the TypeScript compiler API through
// src/typescript-shim.mjs, which the other tests never execute (they import
// the plugin from source, where "typescript" resolves directly). Smoke-test
// the shim against the actual dist bundles in a synthetic node_modules with
// different `typescript` installations.

const SAMPLE_DTS = `export interface Foo {
  bar: number;
}
export type Bar = Foo["bar"];
`;

const CONSUMER_MJS = `import { rollup } from "rollup";
import dts from "rollup-plugin-dts";

const bundle = await rollup({ input: "src/index.d.ts", plugins: [dts()], onwarn() {} });
const { output } = await bundle.generate({ format: "es" });
process.stdout.write(output[0].code);
`;

const CONSUMER_CJS = `const dts = require("rollup-plugin-dts");
if (typeof dts.default !== "function") {
  throw new Error("unexpected default export: " + typeof dts.default);
}
`;

// use junctions so directory links work on Windows without elevated privileges
async function link(target: string, linkPath: string) {
  await fs.mkdir(path.dirname(linkPath), { recursive: true });
  await fs.symlink(target, linkPath, "junction");
}

async function createFixture(tempRoot: string) {
  const pkg = JSON.parse(await fs.readFile(path.resolve("package.json"), "utf-8"));
  const pluginDir = path.join(tempRoot, "node_modules", "rollup-plugin-dts");

  await fs.mkdir(path.join(tempRoot, "src"), { recursive: true });
  await fs.writeFile(path.join(tempRoot, "package.json"), '{ "type": "module" }\n');
  await fs.writeFile(path.join(tempRoot, "src", "index.d.ts"), SAMPLE_DTS);
  await fs.writeFile(path.join(tempRoot, "consumer.mjs"), CONSUMER_MJS);
  await fs.writeFile(path.join(tempRoot, "consumer.cjs"), CONSUMER_CJS);

  await fs.mkdir(pluginDir, { recursive: true });
  await fs.cp(path.resolve("dist"), path.join(pluginDir, "dist"), { recursive: true });
  await fs.writeFile(
    path.join(pluginDir, "package.json"),
    JSON.stringify({ name: "rollup-plugin-dts", type: pkg.type, main: pkg.main, exports: pkg.exports }, null, 2),
  );

  const runtimeDeps = [...Object.keys(pkg.dependencies), ...Object.keys(pkg.optionalDependencies ?? {}), "rollup"];
  for (const dep of runtimeDeps) {
    await link(path.resolve("node_modules", dep), path.join(tempRoot, "node_modules", dep));
  }
}

function runNode(cwd: string, args: Array<string>) {
  return spawnSync(process.execPath, args, { cwd, encoding: "utf8" });
}

export default (t: Harness) => {
  t.test("typescript-shim", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "rollup-plugin-dts-shim-"));
    const tsLink = path.join(tempRoot, "node_modules", "typescript");
    const ts6Link = path.join(tempRoot, "node_modules", "@typescript", "typescript6");
    // in this repo, node_modules/typescript is the aliased @typescript/typescript6
    // install (which provides the compiler API), and node_modules/@typescript/native
    // is typescript@7 (which does not)
    const tsWithApi = path.resolve("node_modules/typescript");
    const ts7 = path.resolve("node_modules/@typescript/native");

    try {
      await createFixture(tempRoot);

      // typescript 4.5 - 6.x: the API comes straight from the user's package
      await link(tsWithApi, tsLink);
      const primary = runNode(tempRoot, ["consumer.mjs"]);
      assert.strictEqual(primary.status, 0, primary.stderr);
      assert.ok(primary.stdout.includes("interface Foo"), primary.stdout);

      // typescript@7 with the @typescript/typescript6 fallback installed
      await fs.rm(tsLink, { recursive: true, force: true });
      await link(ts7, tsLink);
      await link(tsWithApi, ts6Link);
      const fallback = runNode(tempRoot, ["consumer.mjs"]);
      assert.strictEqual(fallback.status, 0, fallback.stderr);
      assert.ok(fallback.stdout.includes("interface Foo"), fallback.stdout);
      const fallbackCjs = runNode(tempRoot, ["consumer.cjs"]);
      assert.strictEqual(fallbackCjs.status, 0, fallbackCjs.stderr);

      // typescript@7 without the fallback: guided error
      await fs.rm(ts6Link, { recursive: true, force: true });
      const missingFallback = runNode(tempRoot, ["consumer.mjs"]);
      assert.notStrictEqual(missingFallback.status, 0, "expected the consumer to fail without @typescript/typescript6");
      assert.ok(missingFallback.stderr.includes("npm install -D @typescript/typescript6"), missingFallback.stderr);

      // no typescript at all: guided error
      await fs.rm(tsLink, { recursive: true, force: true });
      const missingTypeScript = runNode(tempRoot, ["consumer.mjs"]);
      assert.notStrictEqual(missingTypeScript.status, 0, "expected the consumer to fail without typescript");
      assert.ok(missingTypeScript.stderr.includes("npm install -D typescript"), missingTypeScript.stderr);
    } finally {
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  });
};
