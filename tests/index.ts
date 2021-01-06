import preprocess from "./preprocess.js";
import testcases from "./testcases.js";
import { Harness } from "./utils.js";

main();

async function main() {
  const harness = new Harness();

  preprocess(harness);
  testcases(harness);

  const filter = process.argv[2] ?? "";
  const failures = await harness.run(filter);
  if (failures) {
    process.exit(1);
  }
}
