import MagicString from "magic-string";
import ts from "typescript";

export interface TypeHint {
  isTypeOnly: boolean
  isTypeOnlyImport: boolean
  isTypeOnlyNamedImport: boolean
  isTypeOnlyExport: boolean
  isTypeOnlyNamedReExport: boolean
  isTypeOnlyNamespaceReExport: boolean
  hintName: string
  originalName: string
  used?: boolean
}

interface TypeHintStatement {
  statement: ts.TypeAliasDeclaration
  alias: string
  reference: string
  aliasHint: Omit<TypeHint, 'originalName'>
  referenceHint: Omit<TypeHint, 'originalName'>
}

interface TypeHintElement {
  sourceName: string
  importName: string
  hint?: TypeHint
}

export class TypeOnlyFixer {
  private code: MagicString

  constructor(private readonly source: ts.SourceFile) {
    this.code = new MagicString(this.source.getFullText());
  }

  fix() {
    const hints = this.findTypeOnlyHints()
    if(hints.size) {
      this.fixTypeOnlyImports(hints)
      this.fixTypeOnlyExports(hints)
    }
    const code = this.code.toString()
    return {
      code: code,
      typeOnlyHints: hints
    }
  }

  private fixTypeOnlyImports(hints: Map<string, TypeHint[]>) {
    for (const statement of this.source.statements) {
      if (!ts.isImportDeclaration(statement) || !statement.importClause) {
        continue;
      }

      // Restore type-only imports.
      if(statement.importClause.name) {
        const hint = hints.get(statement.importClause.name.text)?.[0];

        // import A$type_only_import from 'a'
        // ↓
        // import type A from 'a';
        if(hint?.isTypeOnlyImport) {
          this.code.overwrite(
            statement.importClause.getStart(), 
            statement.importClause.getEnd(), 
            `type ${hint.originalName}`,
          );
          continue;
        }
      }
  
      // Restore type-only namespace imports/re-exports.
      if (
        statement.importClause.namedBindings 
        && ts.isNamespaceImport(statement.importClause.namedBindings)
      ) {
        const hint = hints.get(statement.importClause.namedBindings.name.text)?.[0];

        // import * as A$type_only_namespace_import from 'a'
        // ↓
        // import type * as A from 'a'
        if(hint?.isTypeOnlyImport) {
          this.code.overwrite(
            statement.importClause.getStart(), 
            statement.importClause.getEnd(), 
            `type * as ${hint.originalName}`,
          )
          continue;
        } 
        
        // import * as A$type_only_namespace_re_export from 'a'
        // ↓
        // export type * as A from 'a'
        if(hint?.isTypeOnlyNamespaceReExport) {
          const specifier = statement.moduleSpecifier.getText()
          hint.used = true
          hints.get(hint.hintName)!.forEach(hint => hint.used = true)
          this.code.overwrite(
            statement.getStart(), 
            statement.getEnd(), 
            `export type * as ${hint.originalName} from ${specifier};`,
          );
          continue;
        }
      }
  
      // Restore type-only named imports/re-exports.
      if (
        statement.importClause.namedBindings 
        && ts.isNamedImports(statement.importClause.namedBindings)
      ) {
        const elements: TypeHintElement[] = [];

        for (const element of statement.importClause.namedBindings.elements) {
          const importName = element.name.text;
          const sourceName = element.propertyName?.text || importName;
          const elementHints = hints.get(importName);

          if(!elementHints) {
            elements.push({ sourceName, importName });
          } else {
            elements.push(...elementHints.map(hint => ({
              sourceName,
              importName: hint.originalName || importName,
              hint,
            })))
          }
        }

        const isNamedReExport = elements.some((element) => element.hint?.isTypeOnlyNamedReExport);
        const hasTypeOnly = elements.some((element) => element.hint?.isTypeOnly);
        const isTypeOnly = elements.length > 0 && elements.every((element) => element.hint?.isTypeOnly)

        const namedBindings = elements
          .map((element) => this.createNamedBindings(element, isTypeOnly))
          .join(', ');
        const typeModifier = isTypeOnly ? 'type ' : '';

        if(isNamedReExport) {
          const specifier = statement.moduleSpecifier.getText();
          elements.forEach((element) => {
            if(element.hint) {
              element.hint.used = true;
              hints.get(element.hint.hintName)!.forEach(hint => hint.used = true);
            }
          })
          // import { A as uniqName } from 'a'
          // type A$type_only_named_re_export = uniqName
          // ↓
          // export type { A } from 'a'
          this.code.overwrite(
            statement.getStart(),
            statement.getEnd(),
            `export ${typeModifier}{ ${namedBindings} } from ${specifier};`,
          );
        } else if(hasTypeOnly) {
          // import { A as uniqName } from 'a'
          // type A$type_only_named_import = uniqName
          // ↓
          // import type { A } from 'a'
          this.code.overwrite(
            statement.importClause.getStart(),
            statement.importClause.getEnd(),
            `${typeModifier}{ ${namedBindings} }`,
          )
        }
      }
    }
  }

  private fixTypeOnlyExports(hints: Map<string, TypeHint[]>) {
    for (const statement of this.source.statements) {
      if (
        !ts.isExportDeclaration(statement) 
        || !statement.exportClause
        || !ts.isNamedExports(statement.exportClause)
      ) {
        continue;
      }

      let removedCount = 0;
      for(const element of statement.exportClause.elements) {
        const hint = element.propertyName?.text 
          ? hints.get(element.propertyName.text)?.[0]
          : null;
        if(
          (hint?.isTypeOnlyNamedReExport || hint?.isTypeOnlyNamespaceReExport)
          && hint.used
        ) {
          // Remove re-exported type hints.
          // export { A$type_only_named_re_export as A }
          // export { A$type_only_namespace_re_export as A }
          // ↓
          // export { }
          this.code.remove(element.getStart(), element.getEnd());
          removedCount++;
          continue;
        }

        if(hint?.isTypeOnly && element.propertyName) {
          // Restore type-only named exports.
          // export { A$type_only_export as A }
          // ↓
          // export { type A }
          this.code.overwrite(
            element.propertyName.getStart(),
            element.propertyName.getEnd(),
            `type ${hint.originalName}`,
          );
        }
      }

      if(removedCount && removedCount === statement.exportClause.elements.length) {
        // Remove the entire export statement if all elements are re-exported types.
        this.code.remove(statement.getStart(), statement.getEnd());
      }
    }
  }

  private findTypeOnlyHints(): Map<string, TypeHint[]> {
    const hintStatements: TypeHintStatement[] = [];
    
    for (const statement of this.source.statements) {
      if (
        ts.isTypeAliasDeclaration(statement) &&
        ts.isTypeReferenceNode(statement.type) &&
        ts.isIdentifier(statement.type.typeName)
      ) {
        const alias = statement.name.text;
        const reference = statement.type.typeName.text;
        const aliasHint = parseTypeOnlyName(alias);
        const referenceHint = parseTypeOnlyName(reference);

        if (aliasHint.isTypeOnly || referenceHint.isTypeOnly) {
          hintStatements.push({ statement, alias, reference, aliasHint, referenceHint });
        }
      }
    }
  
    const hints = new Map<string, TypeHint[]>();

    for (const { statement, alias, aliasHint, reference, referenceHint } of hintStatements) {
      if(referenceHint.isTypeOnlyImport) {
        pushHint(reference, { ...referenceHint, originalName: alias });
      }
      if(aliasHint.isTypeOnlyNamedImport) {
        const originalName = hintStatements.find(({ reference }) => reference === alias)!.alias;
        pushHint(reference, { ...aliasHint, originalName });
      }
      if(aliasHint.isTypeOnlyExport) {
        pushHint(alias, { ...aliasHint, originalName: reference });
      }
      if(aliasHint.isTypeOnlyNamedReExport || aliasHint.isTypeOnlyNamespaceReExport) {
        const originalName = aliasHint.isTypeOnlyNamedReExport
          ? alias.split(TYPE_ONLY_NAMED_RE_EXPORT)[0]!
          : alias.split(TYPE_ONLY_NAMESPACE_RE_EXPORT)[0]!
        pushHint(reference, { ...aliasHint, originalName});
        pushHint(alias, { ...aliasHint, originalName});
      }
      if(aliasHint.isTypeOnly || referenceHint.isTypeOnly) {
        this.code.remove(statement.getStart(), statement.getEnd());
      }
    }

    return hints

    function pushHint(name: string, hint: TypeHint) {
      const _hints = hints.get(name)
      _hints ? _hints.push(hint) : hints.set(name, [hint])
    }
  }

  private createNamedBindings(element: TypeHintElement, isTypeOnly: boolean) {
    const typeModifier = !isTypeOnly 
      // && (element.hint?.isTypeOnlyImport || element.hint?.isTypeOnlyNamedReExport)
      && element.hint?.isTypeOnly
      ? 'type ' 
      : ''
    return element.sourceName === element.importName 
      ? `${typeModifier}${element.importName}` 
      : `${typeModifier}${element.sourceName} as ${element.importName}`
  }
}

const UNIQ_IMPORT = '$UNIQ_IMPORT'
const TYPE_ONLY_IMPORT = '$TYPE_ONLY_IMPORT'
const TYPE_ONLY_NAMED_IMPORT = '$TYPE_ONLY_NAMED_IMPORT'
const TYPE_ONLY_EXPORT = '$TYPE_ONLY_EXPORT'
const TYPE_ONLY_NAMED_RE_EXPORT = '$TYPE_ONLY_NAMED_RE_EXPORT'
const TYPE_ONLY_NAMESPACE_RE_EXPORT = '$TYPE_ONLY_NAMESPACE_RE_EXPORT'
let typeHintIds = 0

export function createUniqImportTypeName() {
  return `${UNIQ_IMPORT}_${typeHintIds++}`
}
export function createTypeOnlyImportName(name: string) {
  return `${name}${TYPE_ONLY_IMPORT}_${typeHintIds++}`
}
export function createTypeOnlyNamedImportName(name: string) {
  return `${name}${TYPE_ONLY_NAMED_IMPORT}_${typeHintIds++}`
}
export function createTypeOnlyExportName(name: string) {
  return `${name}${TYPE_ONLY_EXPORT}_${typeHintIds++}`
}
export function createTypeOnlyNamedReExportName(name: string) {
  return `${name}${TYPE_ONLY_NAMED_RE_EXPORT}_${typeHintIds++}`
}
export function createTypeOnlyNamespaceReExportName(name: string) {
  return `${name}${TYPE_ONLY_NAMESPACE_RE_EXPORT}_${typeHintIds++}`
}
export function parseTypeOnlyName(name: string): Omit<TypeHint, 'originalName'> {
  const isTypeOnlyImport = name.includes(TYPE_ONLY_IMPORT)
  const isTypeOnlyNamedImport = name.includes(TYPE_ONLY_NAMED_IMPORT)
  const isTypeOnlyExport = name.includes(TYPE_ONLY_EXPORT)
  const isTypeOnlyNamedReExport = name.includes(TYPE_ONLY_NAMED_RE_EXPORT)
  const isTypeOnlyNamespaceReExport = name.includes(TYPE_ONLY_NAMESPACE_RE_EXPORT)

  const isTypeOnly = isTypeOnlyImport 
    || isTypeOnlyNamedImport
    || isTypeOnlyExport 
    || isTypeOnlyNamedReExport 
    || isTypeOnlyNamespaceReExport
  
  return {
    isTypeOnly,
    isTypeOnlyImport,
    isTypeOnlyNamedImport,
    isTypeOnlyExport,
    isTypeOnlyNamedReExport,
    isTypeOnlyNamespaceReExport,
    hintName: name,
  }
}
