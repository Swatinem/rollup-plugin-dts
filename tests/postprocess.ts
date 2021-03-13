import ts from "typescript";
import { postProcess } from "../src/transform/postprocess.js";
import { assertProcessedTestcase, forEachFixture, Harness } from "./utils.js";

export default (t: Harness) => {
  forEachFixture("postprocess", (name, dir) => {
    t.test(`postprocess/${name}`, (bless) => {
      return assertProcessedTestcase(
        (fileName, code) => {
          const sourceFile = ts.createSourceFile(fileName, code, ts.ScriptTarget.Latest, true);
          return postProcess({ sourceFile }).code.toString();
        },
        dir,
        bless,
      );
    });
  });
};
