import * as assert from "assert";
import fs from "fs/promises";
import * as path from "path";
import ts from "typescript";
import { preProcess } from "../src/transform/preprocess.js";
import { exists, forEachFixture, Harness } from "./utils.js";

export default (t: Harness) => {
  forEachFixture("preprocess", (name, dir) => {
    t.test(`preprocess/${name}`, (bless) => {
      return assertTestcase(dir, bless);
    });
  });
};

async function assertTestcase(dir: string, bless: boolean) {
  const fileName = path.join(dir, "input.d.ts");
  const contents = await fs.readFile(fileName, "utf-8");

  const sourceFile = ts.createSourceFile(fileName, contents, ts.ScriptTarget.Latest, true);
  const result = preProcess({ sourceFile });
  const code = result.code.toString();

  await assertExpectedResult(path.join(dir, "expected.d.ts"), code, bless);
}

async function assertExpectedResult(file: string, code: string, bless: boolean) {
  const hasExpected = await exists(file);
  if (!hasExpected || bless) {
    await fs.writeFile(file, code);
  }

  const expectedCode = await fs.readFile(file, "utf-8");
  assert.strictEqual(code, expectedCode);
}
