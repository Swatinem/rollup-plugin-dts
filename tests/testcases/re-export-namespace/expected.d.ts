interface A {}
declare function b(): void;
declare class C {}
declare enum D {
  A = 0,
  B = 1,
}
declare const E: string;
declare type F = string;
type namespace_d_A = A;
declare const namespace_d_b: typeof b;
type namespace_d_C = C;
declare const namespace_d_C: typeof C;
type namespace_d_D = D;
declare const namespace_d_D: typeof D;
declare const namespace_d_E: typeof E;
type namespace_d_F = F;
declare namespace namespace_d {
  export {
    namespace_d_A as A,
    namespace_d_b as b,
    namespace_d_C as C,
    namespace_d_D as D,
    namespace_d_E as E,
    namespace_d_F as F,
  };
}
export { namespace_d as ns1, namespace_d as ns2 };
