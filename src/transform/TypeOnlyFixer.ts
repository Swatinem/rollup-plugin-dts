import MagicString from "magic-string";
import ts from "typescript";
import { parse } from "../helpers.js";

type ImportDeclarationWithClause = ts.ImportDeclaration & Required<Pick<ts.ImportDeclaration, 'importClause'>>;
type ExportDeclarationWithClause = ts.ExportDeclaration & Required<Pick<ts.ExportDeclaration, 'exportClause'>>;

export class TypeOnlyFixer {
  private readonly DEBUG = !!process.env.DTS_EXPORTS_FIXER_DEBUG;
  private readonly source: ts.SourceFile;
  private readonly code: MagicString;

  private types: Set<string> = new Set();
  private values: Set<string> = new Set();
  private typeHints: Set<string> = new Set();
  private reExportTypeHints: Set<string> = new Set();

  private importNodes: ImportDeclarationWithClause[] = [];
  private exportNodes: ExportDeclarationWithClause[] = [];

  constructor(fileName: string, rawCode: string) {
    this.source = parse(fileName, rawCode);
    this.code = new MagicString(rawCode);
  }

  fix() {
    this.analyze(this.source.statements);

    for (const node of this.importNodes) {
      this.fixTypeOnlyImport(node);
    }
    for (const node of this.exportNodes) {
      this.fixTypeOnlyExport(node);
    }

    return this.code.toString();
  }

  private fixTypeOnlyImport(node: ImportDeclarationWithClause) {
    const typeImports: string[] = [];
    const valueImports: string[] = [];
    const specifier = node.moduleSpecifier.getText();
    
    if(node.importClause.name) {
      const name = node.importClause.name.text
      if(this.isTypeOnly(name)) {
        // import A from 'a';    ->   import type A from 'a';
        typeImports.push(`import type ${name} from ${specifier};`);
      } else {
        valueImports.push(`import ${name} from ${specifier};`);
      }
    }

    if(
      node.importClause.namedBindings
      && ts.isNamespaceImport(node.importClause.namedBindings)
    ) {
      const name = node.importClause.namedBindings.name.text;
      if(this.isTypeOnly(name)) {
        // import * as A from 'a';   ->   import type * as A from 'a';
        typeImports.push(`import type * as ${name} from ${specifier};`);
      } else {
        valueImports.push(`import * as ${name} from ${specifier};`);
      }
    }

    if(
      node.importClause.namedBindings
      && ts.isNamedImports(node.importClause.namedBindings)
    ) {
      const typeNames: string[] = [];
      const valueNames: string[] = [];

      for(const element of node.importClause.namedBindings.elements) {
        const name = element.name.text;
        if(this.isTypeOnly(name)) {
          // import { A as B } from 'a';   ->   import type { A as B } from 'a';
          typeNames.push(element.getText());
        } else {
          valueNames.push(element.getText());
        }
      }

      if(typeNames.length) {
        typeImports.push(`import type { ${typeNames.join(', ')} } from ${specifier};`)
      }
      if(valueNames.length) {
        valueImports.push(`import { ${valueNames.join(', ')} } from ${specifier};`)
      }
    }

    if(typeImports.length) {
      this.code.overwrite(
        node.getStart(), 
        node.getEnd(), 
        [...valueImports, ...typeImports].join(`\n${getNodeIndent(node)}`),
      );
    }
  }

  private fixTypeOnlyExport(node: ExportDeclarationWithClause) {
    const typeExports: string[] = [];
    const valueExports: string[] = [];
    const specifier = node.moduleSpecifier?.getText();

    if(ts.isNamespaceExport(node.exportClause)) {
      const name = node.exportClause.name.text;
      if(this.isReExportTypeOnly(name)) {
        // export * as A from 'a';   ->   export type * as A from 'a';
        typeExports.push(`export type * as ${name} from ${specifier!};`)
      } else {
        valueExports.push(`export * as ${name} from ${specifier!};`)
      }
    } 

    if(ts.isNamedExports(node.exportClause)) {
      const typeNames: string[] = [];
      const valueNames: string[] = [];

      for(const element of node.exportClause.elements) {
        const name = element.propertyName?.text || element.name.text;
        const isType = node.moduleSpecifier
          ? this.isReExportTypeOnly(element.name.text)
          : this.isTypeOnly(name);
        if(isType) {
          // export { A as B } from 'a';   ->   export type { A as B } from 'a';
          typeNames.push(element.getText())
        } else {
          // export { A as B };   ->   export { A as B };
          valueNames.push(element.getText())
        }
      }

      if(typeNames.length) {
        typeExports.push(`export type { ${typeNames.join(', ')} }${specifier ? ` from ${specifier}` : ''};`)
      }
      if(valueNames.length) {
        valueExports.push(`export { ${valueNames.join(', ')} }${specifier ? ` from ${specifier}` : ''};`)
      }
    }

    if(typeExports.length) {
      this.code.overwrite(
        node.getStart(),
        node.getEnd(),
        [...valueExports, ...typeExports].join(`\n${getNodeIndent(node)}`)
      );
    }
  }

  private analyze(nodes: Iterable<ts.Node>) {
    for (const node of nodes) {
      this.DEBUG && console.log(node.getText(), node.kind);

      if(ts.isImportDeclaration(node) && node.importClause) {
        this.importNodes.push(node as ImportDeclarationWithClause);
        continue;
      }

      if(ts.isExportDeclaration(node) && node.exportClause) {
        this.exportNodes.push(node as ExportDeclarationWithClause);
        continue;
      }

      if (ts.isInterfaceDeclaration(node)) {
        this.DEBUG && console.log(`${node.name.getFullText()} is a type`);
        this.types.add(node.name.text);
        continue;
      }

      if(ts.isTypeAliasDeclaration(node)) {
        const alias = node.name.text;
        this.DEBUG && console.log(`${node.name.getFullText()} is a type`);
        this.types.add(alias);

        if (ts.isTypeReferenceNode(node.type) && ts.isIdentifier(node.type.typeName)) {
          const reference = node.type.typeName.text;
          const aliasHint = parseTypeOnlyName(alias);

          if(aliasHint.isTypeOnly) {
            this.DEBUG && console.log(`${reference} is a type (from type-only hint)`);
            this.typeHints.add(reference)
            if(aliasHint.isReExport) {
              const reExportName = alias.split(TYPE_ONLY_RE_EXPORT)[0]!
              this.DEBUG && console.log(`${reExportName} is a type (from type-only re-export hint)`);
              this.reExportTypeHints.add(reExportName);
            }
            this.code.remove(node.getStart(), node.getEnd());
          }
        }
        continue;
      }

      if (
        ts.isEnumDeclaration(node) ||
        ts.isFunctionDeclaration(node) ||
        ts.isClassDeclaration(node) ||
        ts.isVariableStatement(node)
      ) {
        if (ts.isVariableStatement(node)) {
          for (const declaration of node.declarationList.declarations) {
            if (ts.isIdentifier(declaration.name)) {
              this.DEBUG && console.log(`${declaration.name.getFullText()} is a value (from var statement)`);
              this.values.add(declaration.name.text);
            }
          }
        } else {
          if (node.name) {
            this.DEBUG && console.log(`${node.name.getFullText()} is a value (from declaration)`);
            this.values.add(node.name.text);
          }
        }
        continue;
      }

      if (ts.isModuleBlock(node)) {
        this.analyze(node.statements);
        continue;
      }

      if (ts.isModuleDeclaration(node)) {
        if (node.name && ts.isIdentifier(node.name)) {
          this.DEBUG && console.log(`${node.name.getFullText()} is a value (from module declaration)`);
          this.values.add(node.name.text);
        }
        this.analyze(node.getChildren());
        continue;
      }

      this.DEBUG && console.log("unhandled statement", node.getFullText(), node.kind);
    }
  }

  private isTypeOnly(name: string) {
    return this.typeHints.has(name) || (this.types.has(name) && !this.values.has(name));
  }

  private isReExportTypeOnly(name: string) {
    return this.reExportTypeHints.has(name);
  }
}

function getNodeIndent(node: ts.Node) {
  const match = node.getFullText().match(/^(?:\n*)([ ]*)/)
  return ' '.repeat(match?.[1]?.length || 0);
}

let typeOnlyHintIds = 0;
const TYPE_ONLY = '$TYPE_ONLY_';
const TYPE_ONLY_RE_EXPORT = '$TYPE_ONLY_RE_EXPORT_';

export function createUniqName() {
  return `$imports_${typeOnlyHintIds++}`;
}
export function createTypeOnlyName(name: string) {
  return `${name}${TYPE_ONLY}${typeOnlyHintIds++}`;
}
export function createTypeOnlyReExportName(name: string) {
  return `${name}${TYPE_ONLY_RE_EXPORT}${typeOnlyHintIds++}`;
}

export function parseTypeOnlyName(name: string) {
  const isReExport = name.includes(TYPE_ONLY_RE_EXPORT);
  const isTypeOnly = isReExport || name.includes(TYPE_ONLY);

  return { isTypeOnly, isReExport };
}
