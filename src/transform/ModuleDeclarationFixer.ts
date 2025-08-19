import ts from "typescript";
import MagicString from "magic-string";
import { parse } from "../helpers.js";

export class RelativeModuleDeclarationFixer {
  private sourcemap: boolean;
  private DEBUG: boolean;
  private relativeModuleDeclarations: ts.ModuleDeclaration[];
  private source: ts.SourceFile;
  private code: MagicString;
  private name: string;

  constructor(fileName: string, code: MagicString, sourcemap: boolean, name?: string) {
    this.sourcemap = sourcemap;
    this.DEBUG = !!process.env.DTS_EXPORTS_FIXER_DEBUG;
    this.relativeModuleDeclarations = [];
    this.source = parse(fileName, code.toString());
    this.code = code;
    this.name = name || "./index";
  }

  fix() {
    this.analyze(this.source.statements);

    for (const node of this.relativeModuleDeclarations) {
      const start = node.getStart();
      const end = node.getEnd();

      const quote =
        node.name.kind === ts.SyntaxKind.StringLiteral && "singleQuote" in node.name && node.name.singleQuote
          ? "'"
          : '"';

      const code = `declare module ${quote}${this.name}${quote} ${node.body!.getText()}`;

      this.code.overwrite(start, end, code);
    }

    return {
      code: this.code.toString(),
      map: this.relativeModuleDeclarations.length && this.sourcemap ? this.code.generateMap() : null,
    };
  }

  analyze(nodes: ts.NodeArray<ts.Statement>) {
    for (const node of nodes) {
      if (ts.isModuleDeclaration(node) && node.body && ts.isModuleBlock(node.body) && /^\.\.?\//.test(node.name.text)) {
        if (this.DEBUG) {
          console.log(`Found relative module declaration: ${node.name.text} in ${this.source.fileName}`);
        }

        this.relativeModuleDeclarations.push(node);
      }
    }
  }
}
