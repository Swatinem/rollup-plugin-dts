import ts from 'typescript';

export default {
  tsVersion: "4.7",
  options: {
    respectExternal: true,
    compilerOptions: {
      module: ts.ModuleKind.Node16,
      moduleResolution: ts.ModuleResolutionKind.Node16,
    },
  },
};
