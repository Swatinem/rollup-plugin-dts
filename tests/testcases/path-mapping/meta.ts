import * as ts from "typescript";

const compilerOptions: ts.CompilerOptions = {
  baseUrl: __dirname,
  paths: { "components/*": ["foo/bar/*"] },
};

module.exports = {
  options: { compilerOptions },
};
