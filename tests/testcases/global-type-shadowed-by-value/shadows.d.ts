// These names have no type meaning in this module,
// so their unqualified type references resolve to the global types.
export declare const PropertyKey: { readonly key: true };
export declare function ArrayLike(): void;
export declare const Intl: { readonly local: true };
export declare namespace Record {
  const value: 1;
  interface Local {
    readonly local: true;
  }
}
// This name has a local type meaning, so its type references stay local.
export declare const Iterator: { readonly local: true };
export interface Iterator {
  readonly local: true;
}
export interface Key extends ArrayLike<number> {
  readonly key: PropertyKey;
  readonly record: Record<string, number>;
  readonly iterator: Iterator;
  // `Intl` resolves to the global namespace, and `Record` to the local one.
  readonly intl: Intl.DateTimeFormatOptions;
  readonly recordLocal: Record.Local;
  readonly keyValue: typeof PropertyKey;
  readonly intlValue: typeof Intl;
  readonly recordValue: typeof Record.value;
}
// An export does not declare a name.
export default PropertyKey;
