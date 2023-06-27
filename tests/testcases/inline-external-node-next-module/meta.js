// @ts-check
import ts from "typescript";
/** @type {import('../../testcases').Meta} */
export default {
  tsVersion: "4.7",
  options: {
    respectExternal: true,
    compilerOptions: {
      module: ts.ModuleKind.Node16,
      moduleResolution: ts.ModuleResolutionKind.Node16,
    },
  },
  rollupOptions: {},
};
