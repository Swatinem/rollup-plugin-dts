interface A {}
declare function b(): void;
declare class C {}
declare enum D {
  A = 0,
  B = 1,
}
declare const E: string;
declare type F = string;

var defs_d = /*#__PURE__*/Object.freeze({
  __proto__: null,
  A: A,
  b: b,
  C: C,
  D: D,
  E: E,
  F: F
});

var deep_d = /*#__PURE__*/Object.freeze({
  __proto__: null,
  ns: defs_d
});

var onlyOne_d = /*#__PURE__*/Object.freeze({
  __proto__: null,
  A: A
});

interface WithA {
  a: A;
}

export { WithA, deep_d as deep, defs_d as ns, onlyOne_d as onlyOne };
