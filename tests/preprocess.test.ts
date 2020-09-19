import path from "path";
import fsExtra from "fs-extra";
import { preProcess } from "../src/preprocess";
import ts from "typescript";

const TESTCASES = path.join(__dirname, "preprocess");

async function assertTestcase(dir: string) {
  const fileName = path.join(dir, "input.d.ts");
  const contents = await fsExtra.readFile(fileName, "utf-8");

  const sourceFile = ts.createSourceFile(fileName, contents, ts.ScriptTarget.Latest, true);
  const result = preProcess({ sourceFile });
  const code = result.code.toString();

  await assertExpectedResult(path.join(dir, "expected.d.ts"), code);
}

async function assertExpectedResult(file: string, code: string) {
  const hasExpected = false; //await fsExtra.pathExists(file);
  if (!hasExpected) {
    await fsExtra.writeFile(file, code);
  }

  const expectedCode = await fsExtra.readFile(file, "utf-8");
  expect(code).toEqual(expectedCode);
}

describe("preprocess", () => {
  const dirs = fsExtra.readdirSync(TESTCASES);
  for (const name of dirs) {
    const dir = path.join(TESTCASES, name);
    if (fsExtra.statSync(dir).isDirectory()) {
      it(`works for testcase "${name}"`, () => assertTestcase(dir));
    }
  }
});
