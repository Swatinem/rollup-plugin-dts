declare class A$1 {
  x: string;
}
declare namespace B {
  type A = { y: number };
  function b(a: A$1): A$1;
}
declare function f<A>(a: A, b: A$1): A$1;
interface I<A> {
  a: A;
  b: A$1;
}
export { B, A$1 as Klass, f };
export type { I };
