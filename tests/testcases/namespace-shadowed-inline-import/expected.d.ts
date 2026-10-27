type __A = A;
declare const __A: typeof A;
import __B = B;
declare namespace _ {
  export {
    __A as A,
    __B as B,
  };
}
declare class A {
  p: number;
}
declare namespace B {
  type A = { y: number };
  function b(): _.A;
}
export { A, B };
