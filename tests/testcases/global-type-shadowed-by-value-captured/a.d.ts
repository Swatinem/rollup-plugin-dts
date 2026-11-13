declare const PropertyKey: { readonly key: true };
// the global `PropertyKey` type
export interface A {
  readonly key: PropertyKey;
  readonly value: typeof PropertyKey;
}
