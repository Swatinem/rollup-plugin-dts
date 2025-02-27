import MagicString from "magic-string";
import ts from "typescript";
import { parse } from "../helpers.js";

export class TypeOnlyFixer {
  private readonly fileName: string;
  private readonly rawCode: string;
  private hints: Set<string> = new Set();
  private reExportHints: Set<string> = new Set();
  // Don't worry, these will be initialized as needed.
  private source: ts.SourceFile = null!;
  private code: MagicString = null!;

  constructor(fileName: string, rawCode: string) {
    this.fileName = fileName;
    this.rawCode = rawCode;
  }

  fix() {
    // Pre-check if there are any type-only hints in the file.
    if(!this.rawCode.includes(TYPE_ONLY)) {
      return this.rawCode;
    }

    this.code = new MagicString(this.rawCode);
    this.source = parse(this.fileName, this.rawCode);
    this.initTypeOnlyHints();

    for (const node of this.source.statements) { 
      this.fixTypeOnlyImport(node);
      this.fixTypeOnlyExport(node);
    }

    return this.code.toString();
  }

  private fixTypeOnlyImport(node: ts.Statement) {
    if (!ts.isImportDeclaration(node) || !node.importClause) {
      return;
    }

    const typeImports: string[] = [];
    const valueImports: string[] = [];
    const specifier = node.moduleSpecifier.getText();
    
    if(node.importClause.name) {
      const name = node.importClause.name.text
      if(this.hints.has(name)) {
        // import A from 'a';    ->   import type A from 'a';
        typeImports.push(`import type ${name} from ${specifier};`);
        // importHint.rewrited = true;
      } else {
        valueImports.push(`import ${name} from ${specifier};`);
      }
    }

    if(
      node.importClause.namedBindings
      && ts.isNamespaceImport(node.importClause.namedBindings)
    ) {
      const name = node.importClause.namedBindings.name.text;
      if(this.hints.has(name)) {
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
        if(this.hints.has(name)) {
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
        [...valueImports, ...typeImports].join('\n')
      );
    }
  }

  private fixTypeOnlyExport(node: ts.Statement) {
    if (!ts.isExportDeclaration(node) || !node.exportClause) {
      return;
    }

    const typeExports: string[] = [];
    const valueExports: string[] = [];
    const skippedExports: string[] = [];
    const specifier = node.moduleSpecifier?.getText();

    if(ts.isNamespaceExport(node.exportClause)) {
      const name = node.exportClause.name.text;
      if(this.reExportHints.has(name)) {
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
          ? this.reExportHints.has(element.name.text)
          : this.hints.has(name);
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

    if(typeExports.length || skippedExports.length) {
      this.code.overwrite(
        node.getStart(),
        node.getEnd(),
        [...valueExports, ...typeExports].join('\n')
      );
    }
  }

  private initTypeOnlyHints() {
    for (const node of this.source.statements) {
      if (!ts.isTypeAliasDeclaration(node) || !ts.isTypeReferenceNode(node.type) || !ts.isIdentifier(node.type.typeName)) {
        continue;
      }

      const alias = node.name.text;
      const reference = node.type.typeName.text;
      const aliasHint = parseTypeOnlyName(alias);

      if(aliasHint.isTypeOnly) {
        this.hints.add(reference) 
        if(aliasHint.isReExport) {
          this.reExportHints.add(alias);
        }
        this.code.remove(node.getStart(), node.getEnd());
      }
    }
  }
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
