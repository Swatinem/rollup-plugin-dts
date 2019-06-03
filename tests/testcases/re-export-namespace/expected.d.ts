interface A {
}
declare function b(): void;
declare class C {
}
type namespace_d_A = A;
declare const namespace_d_b: typeof b;
type namespace_d_C = C;
declare const namespace_d_C: typeof C;
declare namespace namespace_d {
  export {
    namespace_d_A as A,
    namespace_d_b as b,
    namespace_d_C as C,
  };
}
export { namespace_d as ns1, namespace_d as ns2 };
