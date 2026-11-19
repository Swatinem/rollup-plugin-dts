import { A as A_ } from "./a";
export declare namespace B {
  type A = { y: number };
  function b(a: A_): A_;
}
export declare function f<A>(a: A, b: A_): A_;
export interface I<A> {
  a: A;
  b: A_;
}
export { A_ as Klass };
