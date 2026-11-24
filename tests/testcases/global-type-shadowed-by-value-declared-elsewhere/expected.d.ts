// `Partial` is also declared in other scopes of this module,
// so none of its type references are qualified.
declare const Partial: { readonly local: true };
type Parameter<Partial> = Partial;
type Inferred<T> = T extends Array<infer Partial> ? Partial : never;
declare namespace A {
  interface Partial {
    readonly member: true;
  }
}
declare namespace A {
  interface Uses {
    readonly key: Partial;
  }
}
type Global = Partial<{ a: 1 }>;
export { A, Partial };
export type { Global, Inferred, Parameter };
