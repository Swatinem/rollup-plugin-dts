interface A {}
declare function b(): void;
declare class C {}
declare enum D {
  A = 0,
  B = 1,
}
declare const E: string;
declare type F = string;

interface GenericI<T1, T2> {}
declare class GenericC<T1, T2> {}
declare function genericF<T1, T2>(): void;
declare type GenericT<T1, T2> = GenericI<T1, T2>;

var namespace_d = /*#__PURE__*/Object.freeze({
  __proto__: null,
  A: A,
  b: b,
  C: C,
  D: D,
  E: E,
  F: F,
  GenericI: GenericI,
  GenericC: GenericC,
  genericF: genericF,
  GenericT: GenericT
});

export { namespace_d as ns1, namespace_d as ns2 };
