// `Partial` is also declared in other scopes of this module,
// so none of its type references are qualified.
declare const Partial: { readonly local: true };
export type Parameter<Partial> = Partial;
export type Inferred<T> = T extends Array<infer Partial> ? Partial : never;
export declare namespace A {
  interface Partial {
    readonly member: true;
  }
}
export declare namespace A {
  interface Uses {
    readonly key: Partial;
  }
}
export type Global = Partial<{ a: 1 }>;
export { Partial };
