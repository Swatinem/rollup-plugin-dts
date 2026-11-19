// These names have no type meaning in this module,
// so their unqualified type references resolve to the global types.
declare const PropertyKey$1: { readonly key: true };
declare const Intl$1: { readonly local: true };
declare namespace Record$1 {
  const value: 1;
  interface Local {
    readonly local: true;
  }
}
// This name has a local type meaning, so its type references stay local.
declare const Iterator$1: { readonly local: true };
interface Iterator$1 {
  readonly local: true;
}
interface Key extends globalThis.ArrayLike<number> {
  readonly key: globalThis.PropertyKey;
  readonly record: globalThis.Record<string, number>;
  readonly iterator: Iterator$1;
  // `Intl` resolves to the global namespace, and `Record` to the local one.
  readonly intl: globalThis.Intl.DateTimeFormatOptions;
  readonly recordLocal: Record$1.Local;
  readonly keyValue: typeof PropertyKey$1;
  readonly intlValue: typeof Intl$1;
  readonly recordValue: typeof Record$1.value;
}
interface Globals {
  key: PropertyKey;
  arrayLike: ArrayLike<number>;
  record: Record<string, number>;
  iterator: Iterator<number>;
  intl: Intl.DateTimeFormatOptions;
}
export type { Globals, Key };
