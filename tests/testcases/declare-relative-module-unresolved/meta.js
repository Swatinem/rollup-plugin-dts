// @ts-check
import * as path from "path";
import { fileURLToPath } from "url";

const dir = path.dirname(fileURLToPath(import.meta.url));

/** @param {string} specifier */
function unresolvedWarning(specifier) {
  return `declare module "${specifier}" (${path.join(dir, specifier)}) could not be resolved to any output chunk, keeping the original specifier`;
}

/** @type {import('../../testcases').Meta} */
export default {
  options: {},
  // `./orphan` exists but is never imported and `./logo.svg` is not a module at
  // all — neither maps to an output chunk, so the original specifiers must be
  // preserved (the orphan augmentation names the chunk's own exported Config,
  // which the old current-chunk fallback would have silently extended)
  expectedWarnings: [unresolvedWarning("./orphan"), unresolvedWarning("./logo.svg")],
  downstream: [
    {
      consumer: "consumer.ts",
      expectedDts: "expected-consumer.d.ts",
      compilerOptions: { skipLibCheck: false },
    },
  ],
};
