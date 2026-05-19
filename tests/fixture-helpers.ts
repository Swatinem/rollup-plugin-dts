import * as path from "path";
import {
  type InputOption,
  type InputOptions,
  rollup,
  type RollupOptions,
  VERSION as rollupVersionMajorMinorPatch,
} from "rollup";
import ts from "typescript";
import dts, { type Options } from "../src/index.js";
import type { DownstreamCase } from "./downstream-helpers.js";
import { exists } from "./utils.js";

export interface Meta {
  options: Options;
  rollupOptions: RollupOptions;
  skip?: boolean;
  expectedError?: string;
  downstream?: DownstreamCase[];
  expectedWarnings?: string[];
  tsVersion?: string;
  rollupVersion?: string;
}

export async function loadFixtureMeta(dir: string): Promise<Meta> {
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

  return meta;
}

export const isFixtureSupported = (meta: Meta) => {
  if (meta.tsVersion) {
    const [major, minor] = ts.versionMajorMinor.split(".").map(Number) as [number, number];
    const [reqMajor, reqMinor] = meta.tsVersion.split(".").map(Number) as [number, number];
    if (major < reqMajor || (major === reqMajor && minor < reqMinor)) {
      return false;
    }
  }

  if (meta.rollupVersion) {
    const [major, minor, patch] = rollupVersionMajorMinorPatch.split(".").map(Number) as [number, number, number];
    const [reqMajor, reqMinor, reqPatch] = meta.rollupVersion.split(".").map(Number) as [number, number, number];
    if (
      major < reqMajor ||
      (major === reqMajor && minor < reqMinor) ||
      (major === reqMajor && minor === reqMinor && patch < reqPatch)
    ) {
      return false;
    }
  }

  return true;
};

export async function createBundle(options: Options, rollupOptions: RollupOptions) {
  const warnings: string[] = [];
  const bundle = await rollup({
    ...rollupOptions,
    plugins: [dts(options)],
    onwarn(warning) {
      // Only capture plugin warnings; ignore Rollup-internal warnings
      // (e.g., UNKNOWN_OPTION from Rollup 3 not recognizing onLog)
      if (typeof warning === "object" && warning.plugin) {
        // Strip Rollup's `[plugin name] ` prefix for version-agnostic assertions
        // (Rollup 4 adds the prefix, Rollup 3 does not)
        const message = String(warning.message || warning).replace(/^\[plugin [^\]]+\] /, "");
        warnings.push(message);
      }
    },
  });

  try {
    const { output } = await bundle.generate({
      ...rollupOptions.output,
      format: "es",
      sourcemap: false,
      sourcemapExcludeSources: true,
    });

    return {
      output,
      warnings,
    };
  } finally {
    await bundle.close();
  }
}

export const withInput = (dir: string, { input }: InputOptions): InputOption => {
  if (typeof input === "string") {
    return path.join(dir, input);
  }
  if (Array.isArray(input)) {
    return input.map((entry) => path.join(dir, entry));
  }
  const mapped: { [alias: string]: string } = {};
  for (const alias of Object.keys(input!)) {
    mapped[alias] = path.join(dir, input![alias]!);
  }
  return mapped;
};
