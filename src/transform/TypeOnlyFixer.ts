import MagicString from "magic-string";
import ts from "typescript";

export interface TypeHint {
  name: string;
  isTypeOnly: boolean;
  isTypeOnlyImport: boolean;
  isTypeOnlyNamedImport: boolean;
  isTypeOnlyNamedExport: boolean;
  isTypeOnlyReExport: boolean;
  rewrited?: boolean;
}

type TypeHintRecords = Array<{ aliasHint: TypeHint, referenceHint: TypeHint }>;

export class TypeOnlyFixer {
  private readonly source: ts.SourceFile;
  private readonly code: MagicString;

  constructor(source: ts.SourceFile) {
    this.source = source;
    this.code = new MagicString(source.getFullText());
  }

  fix() {
    const records = this.findTypeHintRecords();

    if(records.length) {
      for (const statement of this.source.statements) { 
        this.fixTypeOnlyImport(statement, records);
        this.fixTypeOnlyExport(statement, records);
      }
    }

    return this.code.toString();
  }

  private fixTypeOnlyImport(statement: ts.Statement, records: TypeHintRecords) {
    if (!ts.isImportDeclaration(statement) || !statement.importClause) {
      return;
    }

    const typeImports: string[] = [];
    const valueImports: string[] = [];
    const specifier = statement.moduleSpecifier.getText();

    // Restore type-only imports.
    if(statement.importClause.name) {
      const hints = findImportNameHints(statement.importClause.name.text, records);

      if(!hints) {
        valueImports.push(`import ${statement.importClause.name.text} from ${specifier};`);
      } else {
        for(const hint of hints) {
          // import uniqName from 'a'
          // type A$type_only_import = uniqName
          // type A = A$type_only_import
          // ↓
          // import type A from 'a'
          typeImports.push(`import type ${hint.originalName} from ${specifier};`);
        }
      }
    }

    // Restore type-only namespace imports/re-exports.
    if (
      statement.importClause.namedBindings 
      && ts.isNamespaceImport(statement.importClause.namedBindings)
    ) {
      const _hints = findImportNameHints(statement.importClause.namedBindings.name.text, records);

      if(!_hints) {
        valueImports.push(`import * as ${statement.importClause.namedBindings.name.text} from ${specifier};`);
      } else {
        for(const hint of _hints) {
          if(hint.hint.isTypeOnlyImport) {
            // import * as uniqName from 'a'
            // type A$type_only_namespace_import = uniqName
            // type A = A$type_only_namespace_import
            // ↓
            // import type * as A from 'a'
            typeImports.push(`import type * as ${hint.originalName} from ${specifier};`);
          } else if (hint.hint.isTypeOnlyReExport) {
            // import * as uniqName from 'a'
            // type A$type_only_namespace_re_export = uniqName
            // export type { A$type_only_namespace_re_export as A }
            // ↓
            // export type * as A from 'a'
            hint.hint.rewrited = true;
            typeImports.push(`export type * as ${hint.originalName} from ${specifier};`);
          }
        }
      }
    }

    // Restore type-only named imports/re-exports.
    if (
      statement.importClause.namedBindings 
      && ts.isNamedImports(statement.importClause.namedBindings)
    ) {
      const typeOnlyNamedImports: Array<[sourceName: string, localName: string]> = [];
      const typeOnlyNamedReExports: Array<[sourceName: string, localName: string]> = [];
      const valueNamedImports: Array<[sourceName: string, localName: string]> = [];

      for (const element of statement.importClause.namedBindings.elements) {
        const localName = element.name.text;
        const sourceName = element.propertyName?.text || localName;
        const _hints = findImportNameHints(localName, records);

        if(!_hints) {
          valueNamedImports.push([sourceName, localName]);
        } else {
          for(const hint of _hints) {
            if(hint.hint.isTypeOnlyNamedImport) {
              // import { A as uniqName } from 'a'
              // type A$type_only_named_import = uniqName
              // type A = A$type_only_named_import
              // ↓
              // import type { A } from 'a'
              typeOnlyNamedImports.push([sourceName, hint.originalName]);
            } else if(hint.hint.isTypeOnlyReExport) {
              // import { A as uniqName } from 'a'
              // type A$type_only_named_re_export = uniqName
              // export { A$type_only_named_re_export as A }
              // ↓
              // export type { A } from 'a'
              hint.hint.rewrited = true;
              typeOnlyNamedReExports.push([sourceName, hint.originalName]);
            }
          }
        }
      }

      if(typeOnlyNamedImports.length) {
        typeImports.push(`import type { ${getNamedBindings(typeOnlyNamedImports)} } from ${specifier};`);
      }

      if(typeOnlyNamedReExports.length) {
        typeImports.push(`export type { ${getNamedBindings(typeOnlyNamedReExports)} } from ${specifier};`);
      }

      if(valueNamedImports.length) {
        valueImports.push(`import { ${getNamedBindings(valueNamedImports)} } from ${specifier};`);
      }
    }

    if(typeImports.length) {
      this.code.overwrite(
        statement.getStart(),
        statement.getEnd(),
        [...valueImports, ...typeImports].join('\n'),
      )
    }
  }

  private fixTypeOnlyExport(statement: ts.Statement, hints: TypeHintRecords) {
    if (
      !ts.isExportDeclaration(statement) 
      || !statement.exportClause
      || !ts.isNamedExports(statement.exportClause)
      || statement.moduleSpecifier
    ) {
      return;
    }

    let removedCount = 0;
    for(const element of statement.exportClause.elements) {
      if(!element.propertyName?.text) {
        continue;
      }

      const exportName = element.name.text;
      const localName = element.propertyName.text;
      const hint = findExportNameHint(localName, hints);

      if(!hint) {
        continue;
      } 

      if(hint.hint.rewrited) {
        this.code.remove(element.getStart(), element.getEnd());
        removedCount++;
      } else {
        this.code.overwrite(
          element.getStart(),
          element.getEnd(),
          `type ${getNamedBindings([[hint.originalName, exportName]])}`,
        )
      }
    }

    if(removedCount && removedCount === statement.exportClause.elements.length) {
      // Remove the entire export statement if all elements are re-exported types.
      this.code.remove(statement.getStart(), statement.getEnd());
    }
  }

  private findTypeHintRecords() {
    const records: TypeHintRecords = [];
    
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

        if(aliasHint.isTypeOnly || referenceHint.isTypeOnly) {
          records.push({ aliasHint, referenceHint });
          this.code.remove(statement.getStart(), statement.getEnd());
        }
      }
    }

    return records;
  }
}

function findImportNameHints(name: string, records: TypeHintRecords) {
  const matchedRecords = records.filter((record) => record.referenceHint.name === name);

  if(!matchedRecords.length) {
    return null;
  }
  
  return matchedRecords.map((record) => ({
    hint: record.aliasHint,
    originalName: record.aliasHint.isTypeOnlyReExport
      ? record.aliasHint.name.split(TYPE_ONLY_RE_EXPORT)[0]!
      : findOriginalName(record.aliasHint.name, 'import', records),
  }))
}

function findExportNameHint(name: string, records: TypeHintRecords) {
  const matchedRecord = records.find((record) => 
    record.aliasHint.isTypeOnly && record.aliasHint.name === name
  );

  if(!matchedRecord) {
    return null;
  }

  return {
    hint: matchedRecord.aliasHint,
    originalName: findOriginalName(name, 'export', records),
  }
}

function findOriginalName(
  name: string,
  type: 'import' | 'export',
  records: Array<{ aliasHint: TypeHint, referenceHint: TypeHint }>
) {
  const hintKey = type === 'import' ? 'referenceHint' : 'aliasHint';
  const record = records.find((record) => record[hintKey].name === name);

  if(!record) {
    return name;
  }
  
  const reversedHintKey = type === 'import' ? 'aliasHint' : 'referenceHint';
  if(record[reversedHintKey].isTypeOnly) {
    return findOriginalName(record[reversedHintKey].name, type, records);
  } else {
    return record[reversedHintKey].name;
  }
}

function getNamedBindings(bindings: Array<[sourceName: string, targetName: string]>  ) {
  return bindings.map(([sourceName, targetName]) => sourceName === targetName 
    ? sourceName 
    : `${sourceName} as ${targetName}`
  ).join(', ');
}

const UNIQ_IMPORT = '$UNIQ_IMPORT';
const TYPE_ONLY_IMPORT = '$TYPE_ONLY_IMPORT';
const TYPE_ONLY_NAMED_IMPORT = '$TYPE_ONLY_NAMED_IMPORT';
const TYPE_ONLY_NAMED_EXPORT = '$TYPE_ONLY_NAMED_EXPORT';
const TYPE_ONLY_RE_EXPORT = '$TYPE_ONLY_RE_EXPORT';
let typeHintIds = 0;

export function createUniqImportTypeName() {
  return `${UNIQ_IMPORT}_${typeHintIds++}`;
}
export function createTypeOnlyImportName(name: string) {
  return `${name}${TYPE_ONLY_IMPORT}_${typeHintIds++}`;
}
export function createTypeOnlyNamedImportName(name: string) {
  return `${name}${TYPE_ONLY_NAMED_IMPORT}_${typeHintIds++}`;
}
export function createTypeOnlyExportName(name: string) {
  return `${name}${TYPE_ONLY_NAMED_EXPORT}_${typeHintIds++}`;
}
export function createTypeOnlyReExportName(name: string) {
  return `${name}${TYPE_ONLY_RE_EXPORT}_${typeHintIds++}`;
}
function parseTypeOnlyName(name: string): Omit<TypeHint, 'originalName'> {
  const isTypeOnlyImport = name.includes(TYPE_ONLY_IMPORT);
  const isTypeOnlyNamedImport = name.includes(TYPE_ONLY_NAMED_IMPORT);
  const isTypeOnlyNamedExport = name.includes(TYPE_ONLY_NAMED_EXPORT);
  const isTypeOnlyReExport = name.includes(TYPE_ONLY_RE_EXPORT);

  const isTypeOnly = isTypeOnlyImport 
    || isTypeOnlyNamedImport
    || isTypeOnlyNamedExport 
    || isTypeOnlyReExport 
  
  return {
    name,
    isTypeOnly,
    isTypeOnlyImport,
    isTypeOnlyNamedImport,
    isTypeOnlyNamedExport,
    isTypeOnlyReExport,
  }
}
