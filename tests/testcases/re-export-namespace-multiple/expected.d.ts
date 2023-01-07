interface A {}
declare function B(): void;
declare class C {}
declare enum D {
  A = 0,
  B = 1,
}
declare const E: string;
declare type F = string;
type defs_d_A = A;
declare const defs_d_B: typeof B;
type defs_d_C = C;
declare const defs_d_C: typeof C;
type defs_d_D = D;
declare const defs_d_D: typeof D;
declare const defs_d_E: typeof E;
type defs_d_F = F;
declare namespace defs_d {
  export {
    defs_d_A as A,
    defs_d_B as B,
    defs_d_C as C,
    defs_d_D as D,
    defs_d_E as E,
    defs_d_F as F,
  };
}
declare namespace deep_d {
  export {
    defs_d as ns,
  };
}
type onlyOne_d_A = A;
declare namespace onlyOne_d {
  export {
    onlyOne_d_A as A,
  };
}
interface WithA {
  a: A;
}
export { WithA, deep_d as deep, defs_d as ns, onlyOne_d as onlyOne };
