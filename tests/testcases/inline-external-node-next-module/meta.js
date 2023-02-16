import ts from 'typescript';

export default {
  options: {
    respectExternal: true,
    compilerOptions: {
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
    }
  },
};
