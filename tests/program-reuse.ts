import * as assert from "node:assert";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { rollup } from "rollup";
import ts from "typescript";
import dts from "../src/index.js";
import type { Harness } from "./utils.js";

interface CoverageFunction {
  functionName: string;
  ranges: Array<{ count: number }>;
}

interface CoverageScript {
  url: string;
  functions: CoverageFunction[];
}

/** These are temporary input packages, never the checkout's installed dependencies. */
export async function writeProgramReuseFixture(directory: string, count: number, sibling = false) {
  const library = path.join(directory, "node_modules", "reuse-declarations");
  await fs.mkdir(library, { recursive: true });
  await fs.writeFile(path.join(library, "package.json"), JSON.stringify({
    name: "reuse-declarations", version: "1.0.0", types: "index.d.ts",
  }));
  const declarations = [path.join(library, "index.d.ts")];
  const exports = [];
  for (let index = 0; index < count; index++) {
    const name = `Item${index}`;
    const file = path.join(library, `item-${index}.d.ts`);
    await fs.writeFile(file, `export declare class ${name} { value: ${index} }\n`);
    declarations.push(file);
    exports.push(`export { ${name} } from './item-${index}';`);
  }
  await fs.writeFile(declarations[0]!, `export declare class Root { p: number }
export declare namespace Scope {
  type Root = { y: number };
  function b(): import('.').Root;
}
${exports.join("\n")}
`);
  await fs.writeFile(path.join(directory, "index.ts"), `export { Root, Scope, ${Array.from({ length: count }, (_, index) => `Item${index}`).join(", ")} } from 'reuse-declarations';
export const ownValue = 42;
`);
  // Use the resolution spelling supported by the actual API in the owner's TS matrix.
  await fs.writeFile(path.join(directory, "tsconfig.json"), JSON.stringify({
    compilerOptions: {
      target: "ES2020", module: "ESNext", strict: true, types: [],
      moduleResolution: ts.ModuleResolutionKind.Bundler === undefined ? "node" : "bundler",
    },
    files: ["index.ts"],
  }));
  if (sibling) {
    const declaration = path.join(directory, "index.d.ts");
    await fs.writeFile(declaration, "export declare const ownValue: string;\n");
    declarations.splice(0, declarations.length, declaration);
  }
  return declarations;
}

async function nativeCompiler() {
  const packageDirectory = path.resolve("node_modules/@typescript/native");
  const manifest = JSON.parse(await fs.readFile(path.join(packageDirectory, "package.json"), "utf8"));
  const resolver = manifest.imports?.["#getExePath"];
  assert.strictEqual(typeof resolver, "string");
  const { default: getExePath } = await import(pathToFileURL(path.resolve(packageDirectory, resolver)).href);
  assert.strictEqual(typeof getExePath, "function");
  const executable: unknown = getExePath();
  assert.ok(typeof executable === "string");
  const platformManifest = JSON.parse(await fs.readFile(path.join(path.dirname(executable), "..", "package.json"), "utf8"));
  assert.strictEqual(manifest.optionalDependencies?.[platformManifest.name], platformManifest.version);
  assert.strictEqual(platformManifest.version, manifest.version);
  return {
    executable,
    version: manifest.version,
    platformPackage: platformManifest.name,
    sha256: createHash("sha256").update(await fs.readFile(executable)).digest("hex"),
  };
}

async function runCompiler(directory: string, args: string[], timeout = 50000) {
  // The official wrapper adds no args/env. Spawn its exact native target so a
  // timeout owns the compiler itself on Node 20 and Windows as well.
  const compiler = await nativeCompiler();
  const start = performance.now();
  const result = spawnSync(compiler.executable, args, {
    cwd: directory, encoding: "utf8", timeout, killSignal: "SIGKILL",
  });
  process.stdout.write(JSON.stringify({
    phase: "strict-consumer", compiler, args, timeout, pid: result.pid,
    elapsedMs: performance.now() - start, status: result.status, signal: result.signal,
    stdout: result.stdout, stderr: result.stderr, error: result.error?.message,
    errorCode: result.error && "code" in result.error ? result.error.code : undefined,
  }) + "\n");
  return result;
}

async function compile(directory: string, config: string) {
  const result = await runCompiler(directory, ["--project", config, "--pretty", "false"]);
  assert.ifError(result.error);
  assert.strictEqual(result.signal, null);
  return { status: result.status, output: `${result.stdout}${result.stderr}`.trim() };
}

async function assertConsumers(directory: string, code: string, sibling: boolean) {
  await fs.writeFile(path.join(directory, "bundle.d.ts"), code);
  const positive = sibling
    ? "import { ownValue } from './bundle.js';\nconst value: string = ownValue;\nvoid value;\n"
    : "import { Scope, Item0, ownValue } from './bundle.js';\nconst value: number = Scope.b().p;\nconst local: Scope.Root = { y: 1 };\nconst item: 0 = new Item0().value;\nconst own: number = ownValue;\nvoid [value, local, item, own];\n";
  const negative = sibling
    ? "import { ownValue } from './bundle.js';\nconst value: number = ownValue;\nvoid value;\n"
    : "import { Scope } from './bundle.js';\nconst value: string = Scope.b().p;\nvoid value;\n";
  for (const [name, source] of [["positive", positive], ["negative", negative]]) {
    assert.ok(name && source);
    await fs.writeFile(path.join(directory, `${name}.ts`), source);
    const config = path.join(directory, `${name}.json`);
    await fs.writeFile(config, JSON.stringify({
      compilerOptions: {
        module: "Preserve", moduleResolution: "Bundler", target: "ESNext",
        strict: true, skipLibCheck: false, noEmit: true, types: [], paths: {},
      },
      files: [`${name}.ts`],
    }));
    const result = await compile(directory, config);
    if (name === "positive") {
      assert.strictEqual(result.status, 0, result.output);
      assert.strictEqual(result.output, "");
    } else {
      assert.strictEqual(result.status, 1, result.output);
      const type = sibling ? "string" : "number";
      const expected = sibling ? "number" : "string";
      const diagnostic = result.output.match(/^(.+)\((\d+),(\d+)\): error TS(\d+): (.+)$/);
      assert.ok(diagnostic, result.output);
      assert.strictEqual(await fs.realpath(path.resolve(directory, diagnostic[1]!)), await fs.realpath(path.join(directory, "negative.ts")));
      assert.deepStrictEqual(diagnostic.slice(2, 5).map(Number), [2, 7, 2322]);
      assert.strictEqual(diagnostic[5], `Type '${type}' is not assignable to type '${expected}'.`);
    }
  }
}

async function assertProgramReuse(count: number, sibling = false) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "dts-program-reuse-"));
  try {
    const declarations = await writeProgramReuseFixture(directory, count, sibling);
    const coverage = path.join(directory, "coverage");
    await fs.mkdir(coverage);
    const child = spawnSync(process.execPath, [
      fileURLToPath(new URL("./program-reuse-child.js", import.meta.url)), directory,
    ], {
      env: { ...process.env, NODE_V8_COVERAGE: coverage }, encoding: "utf8", timeout: 50000, killSignal: "SIGKILL",
    });
    process.stdout.write(JSON.stringify({
      phase: "declaration-bundle", count, sibling, status: child.status, signal: child.signal,
      stdout: child.stdout, stderr: child.stderr, error: child.error?.message,
    }) + "\n");
    assert.ifError(child.error);
    assert.strictEqual(child.signal, null);
    assert.strictEqual(child.status, 0, child.stderr);
    const result: { code: string; watchFiles: string[] } = JSON.parse(child.stdout);
    const scripts: CoverageScript[] = [];
    for (const file of await fs.readdir(coverage)) {
      if (!file.startsWith("coverage-") || !file.endsWith(".json")) continue;
      const report: { result: CoverageScript[] } = JSON.parse(await fs.readFile(path.join(coverage, file), "utf8"));
      scripts.push(...report.result.filter((script) => script.url === new URL("../src/program.js", import.meta.url).href));
    }
    process.stdout.write(JSON.stringify({ phase: "program-module-coverage", count, sibling, scripts }) + "\n");
    for (const declaration of declarations) {
      assert.ok(result.watchFiles.includes(await fs.realpath(declaration)), `Declaration not watched: ${declaration}`);
    }
    await assertConsumers(directory, result.code, sibling);
    assert.strictEqual(scripts.length, 1, "Missing or ambiguous actual program-module coverage");
    const root = scripts[0]!.functions.find((fn) => fn.functionName === "createPrograms");
    const fallback = scripts[0]!.functions.find((fn) => fn.functionName === "createProgram");
    assert.ok(root && fallback, "Missing actual constructor coverage, never infer missing as zero");
    const calls = { typedRoots: root.ranges[0]?.count, fallback: fallback.ranges[0]?.count };
    assert.strictEqual(calls.typedRoots, 1, "The real typed-entry program must be constructed");
    assert.strictEqual(calls.fallback, 0, `Selected declarations must not create fallback full programs: ${JSON.stringify(calls)}`);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}

export default (harness: Harness) => {
  for (const count of [1, 4]) {
    harness.test(`program-reuse/default-options-prior-resolver-${count}`, () => assertProgramReuse(count));
  }
  harness.test("program-reuse/sibling-declaration-text-and-watch", () => assertProgramReuse(1, true));
  harness.test("program-reuse/default-external-policy", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "dts-program-policy-"));
    try {
      await writeProgramReuseFixture(directory, 1);
      const bundle = await rollup({ input: path.join(directory, "index.ts"), plugins: [dts()] });
      try {
        const { output } = await bundle.generate({ format: "es" });
        const chunk = output[0];
        assert.ok(chunk && chunk.type === "chunk");
        assert.match(chunk.code, /from ['"]reuse-declarations['"]/);
        assert.ok(!chunk.code.includes("declare class Root"));
        await assertConsumers(directory, chunk.code, false);
      } finally {
        await bundle.close();
      }
    } finally {
      await fs.rm(directory, { recursive: true, force: true });
    }
  });
  harness.test("program-reuse/native-compiler-timeout-is-reaped", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "dts-native-timeout-"));
    try {
      await fs.writeFile(path.join(directory, "input.ts"), "export const value: number = 1;\n");
      const config = path.join(directory, "tsconfig.json");
      await fs.writeFile(config, JSON.stringify({
        compilerOptions: {
          module: "Preserve", moduleResolution: "Bundler", target: "ESNext",
          strict: true, skipLibCheck: false, noEmit: true, types: [], paths: {},
        },
        files: ["input.ts"],
      }));
      // This real watch program remains live; only this deliberate boundary
      // control uses 2s. Every normal strict compiler keeps its original 50s.
      const result = await runCompiler(directory, ["--project", config, "--watch", "--pretty", "false"], 2000);
      let gone = false;
      try {
        process.kill(result.pid, 0);
      } catch (error) {
        gone = error instanceof Error && "code" in error && error.code === "ESRCH";
      }
      process.stdout.write(JSON.stringify({ phase: "native-compiler-reap", pid: result.pid, gone }) + "\n");
      assert.ok(result.pid > 0);
      assert.ok(result.error && "code" in result.error && result.error.code === "ETIMEDOUT");
      assert.notStrictEqual(result.status, 0);
      assert.match(`${result.stdout}${result.stderr}`, /Found 0 errors\. Watching for file changes\./);
      assert.ok(gone, "The actual native compiler must be terminated and reaped");
    } finally {
      await fs.rm(directory, { recursive: true, force: true });
    }
  });
};
