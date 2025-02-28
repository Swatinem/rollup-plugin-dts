import ts from 'typescript'

export class LanguageService {
  private readonly fileName = "index.d.ts";
  private service: ts.LanguageService;

  constructor(code: string) {
    const serviceHost: ts.LanguageServiceHost = {
      getCompilationSettings: () => ({
        noEmit: true,
        noResolve: true,
        skipLibCheck: true,
        declaration: false,
        checkJs: false,
        declarationMap: false,
        target: ts.ScriptTarget.ESNext,
      }),
      getScriptFileNames: () => [this.fileName],
      getScriptVersion: () => "1",
      getScriptSnapshot: (fileName) => fileName === this.fileName 
        ? ts.ScriptSnapshot.fromString(code) 
        : undefined,
      getCurrentDirectory: () => "",
      getDefaultLibFileName: () => "",
      fileExists: (fileName) => fileName === this.fileName,
      readFile: (fileName) => fileName === this.fileName ? code : undefined,
    };
  
    this.service = ts.createLanguageService(
      serviceHost, 
      ts.createDocumentRegistry(undefined, ""),
      ts.LanguageServiceMode.PartialSemantic,
    );
  }

  findReferenceCount(node: ts.Node) {
    const referencedSymbols = this.service.findReferences(this.fileName, node.getStart());
  
    if (!referencedSymbols?.length) {
      return 0;
    }

    return referencedSymbols.reduce((total, symbol) => total + symbol.references.length, 0);
  }
}