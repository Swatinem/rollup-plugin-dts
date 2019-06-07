interface A {
}
declare function b(): void;
declare class C {
}
type namespace_A = A;
declare const namespace_b: typeof b;
type namespace_C = C;
declare const namespace_C: typeof C;
declare namespace namespace {
  export {
    namespace_A as A,
    namespace_b as b,
    namespace_C as C,
  };
}
export { namespace as ns1, namespace as ns2 };
