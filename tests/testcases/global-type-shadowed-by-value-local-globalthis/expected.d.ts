// A local `globalThis` would capture a `globalThis.` qualifier, so the references stay as they are.
declare const PropertyKey: { readonly key: true };
declare namespace globalThis {
  type PropertyKey = { readonly local: true };
}
interface A {
  readonly key: PropertyKey;
}
export { globalThis };
export type { A };
