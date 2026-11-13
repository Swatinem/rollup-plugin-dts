type PropertyKey$1 = { readonly local: true };
interface B {
  readonly key: PropertyKey$1;
}
declare const PropertyKey: { readonly key: true };
// the global `PropertyKey` type
interface A {
  readonly key: globalThis.PropertyKey;
  readonly value: typeof PropertyKey;
}
export type { A, B };
