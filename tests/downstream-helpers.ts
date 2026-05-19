import * as assert from "assert";
import { spawnSync } from "child_process";
import fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import type { OutputChunk, RollupOutput } from "rollup";
import { exists } from "./utils.js";

export interface DownstreamCase {
  consumer: string;
  expectedDts?: string;
  expectedError?: string;
  expectedErrorIncludes?: string[];
  compilerOptions?: {
    module?: "NodeNext" | "ESNext";
    moduleResolution?: "NodeNext" | "Bundler";
    target?: "ESNext";
    skipLibCheck?: boolean;
  };
}

function clean(code: string = "") {
  return (
    code
      .trim()
      // skip blank lines
      .replace(/\n+/gm, "\n") + "\n"
  );
}

function isOutputChunk(output: RollupOutput["output"][number]): output is OutputChunk {
  return output.type === "chunk";
}

function getRuntimeFileName(fileName: string) {
  if (fileName.endsWith(".d.mts")) {
    return fileName.slice(0, -6) + ".mjs";
  }
  if (fileName.endsWith(".d.cts")) {
    return fileName.slice(0, -6) + ".cjs";
  }
  if (fileName.endsWith(".d.ts")) {
    return fileName.slice(0, -5) + ".js";
  }
  return `${fileName}.js`;
}

function getPackageExportKeys(fileName: string) {
  const normalizedFileName = fileName.replace(/\.d\.d(\.[mc]?ts)$/, ".d$1");
  const declarationPath = normalizedFileName.replace(/\.d\.[mc]?ts$/, "").replace(/\\/g, "/");
  if (declarationPath === "index") {
    return [".", "./index"];
  }
  return [`./${declarationPath}`];
}

function formatDiagnostic(output: string, cwd: string) {
  return output.trim().replaceAll(cwd + path.sep, "");
}

async function writeBundleAsPackage(packageDir: string, output: RollupOutput["output"]) {
  const distDir = path.join(packageDir, "dist");
  const exportsMap: Record<string, { types: string; default: string }> = {};

  await fs.mkdir(distDir, { recursive: true });

  for (const file of output.filter(isOutputChunk)) {
    const declarationPath = path.join(distDir, file.fileName);
    const runtimeFileName = getRuntimeFileName(file.fileName);
    const runtimePath = path.join(distDir, runtimeFileName);

    await fs.mkdir(path.dirname(declarationPath), { recursive: true });
    await fs.mkdir(path.dirname(runtimePath), { recursive: true });
    await fs.writeFile(declarationPath, clean(file.code));
    await fs.writeFile(runtimePath, "export {};\n");

    if (file.isEntry) {
      for (const exportKey of getPackageExportKeys(file.fileName)) {
        exportsMap[exportKey] = {
          types: `./dist/${file.fileName.replace(/\\/g, "/")}`,
          default: `./dist/${runtimeFileName.replace(/\\/g, "/")}`,
        };
      }
    }
  }

  const packageJson: {
    name: string;
    type: "module";
    exports: Record<string, { types: string; default: string }>;
    main?: string;
    types?: string;
  } = {
    name: "lib",
    type: "module",
    exports: exportsMap,
  };
  if (exportsMap["."]) {
    packageJson.main = exportsMap["."].default;
    packageJson.types = exportsMap["."].types;
  }

  await fs.writeFile(path.join(packageDir, "package.json"), `${JSON.stringify(packageJson, null, 2)}\n`);
}

export async function assertDownstream(
  dir: string,
  output: RollupOutput["output"],
  downstream: DownstreamCase[],
  bless: boolean,
) {
  const tscBin = path.resolve("node_modules/typescript/bin/tsc");

  for (const testCase of downstream) {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "rollup-plugin-dts-downstream-"));

    try {
      const consumerDir = path.join(tempRoot, "consumer");
      const srcDir = path.join(consumerDir, "src");
      const sourceFile = path.join(srcDir, "index.ts");
      const packageDir = path.join(consumerDir, "node_modules", "lib");
      const compilerOptions = {
        module: "NodeNext",
        moduleResolution: "NodeNext",
        skipLibCheck: true,
        target: "ESNext",
        ...testCase.compilerOptions,
      } as const;

      await writeBundleAsPackage(packageDir, output);
      await fs.mkdir(srcDir, { recursive: true });
      await fs.writeFile(path.join(consumerDir, "package.json"), '{\n  "type": "module"\n}\n');
      await fs.writeFile(sourceFile, await fs.readFile(path.join(dir, testCase.consumer), "utf-8"));

      const emitArgs = [
        tscBin,
        "--declaration",
        "--emitDeclarationOnly",
        "--target",
        compilerOptions.target,
      ];
      if (compilerOptions.skipLibCheck) {
        emitArgs.push("--skipLibCheck");
      }
      emitArgs.push(
        "--module",
        compilerOptions.module,
        "--moduleResolution",
        compilerOptions.moduleResolution,
        sourceFile,
      );

      const emit = spawnSync(process.execPath, emitArgs, {
        cwd: consumerDir,
        encoding: "utf8",
      });
      const diagnostic = formatDiagnostic(`${emit.stdout || ""}${emit.stderr || ""}`, consumerDir);

      if (testCase.expectedError || testCase.expectedErrorIncludes?.length) {
        assert.notStrictEqual(emit.status, 0, `Expected downstream consumer ${testCase.consumer} to fail`);
        if (testCase.expectedError) {
          assert.strictEqual(diagnostic, testCase.expectedError);
        }
        for (const expected of testCase.expectedErrorIncludes || []) {
          assert.ok(
            diagnostic.includes(expected),
            `Expected downstream diagnostic to include ${JSON.stringify(expected)}.\nReceived:\n${diagnostic}`,
          );
        }
        continue;
      }

      assert.strictEqual(emit.status, 0, diagnostic);
      assert.ok(testCase.expectedDts, `Expected downstream success case ${testCase.consumer} to declare expectedDts`);

      const emittedFile = path.join(srcDir, "index.d.ts");
      const emittedDts = await fs.readFile(emittedFile, "utf-8");
      const expectedDts = path.join(dir, testCase.expectedDts);
      const hasExpected = await exists(expectedDts);

      if (!hasExpected || bless) {
        await fs.writeFile(expectedDts, clean(emittedDts));
      }

      assert.strictEqual(clean(emittedDts), await fs.readFile(expectedDts, "utf-8"));

      const sanity = spawnSync(
        process.execPath,
        [
          tscBin,
          "--noEmit",
          "--target",
          compilerOptions.target,
          "--module",
          compilerOptions.module,
          "--moduleResolution",
          compilerOptions.moduleResolution,
          emittedFile,
        ],
        {
          cwd: consumerDir,
          encoding: "utf8",
        },
      );
      const sanityDiagnostic = formatDiagnostic(`${sanity.stdout || ""}${sanity.stderr || ""}`, consumerDir);
      assert.strictEqual(sanity.status, 0, sanityDiagnostic);
    } finally {
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  }
}
