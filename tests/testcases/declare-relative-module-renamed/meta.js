// @ts-check
import * as path from "path";
import { fileURLToPath } from "url";

const dir = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('../../testcases').Meta} */
export default {
  options: {},
  // foo-a and foo-b both export `Foo` and land in the same shared chunk, where
  // Rollup renames one of them — retargeting the augmentation's specifier would
  // merge `extra` into the wrong interface, so the original specifier is kept
  expectedWarnings: [
    `declare module "./foo-b" (${path.join(dir, "foo-b")}) augments names that the target chunk does not export unchanged, keeping the original specifier`,
  ],
  rollupOptions: {
    input: {
      "entry-a": "entry-a.d.ts",
      "entry-b": "entry-b.d.ts",
    },
  },
  downstream: [
    {
      consumer: "consumer.ts",
      expectedDts: "expected-consumer.d.ts",
    },
  ],
  // expected.d.ts encodes Rollup 4 chunk hosting and alias names; early Rollup 3
  // produces an equivalent but differently-shaped chunk, failing only the snapshot
  rollupVersion: "4.0.0",
};
