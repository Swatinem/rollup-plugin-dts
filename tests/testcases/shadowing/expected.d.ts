declare class GenericKlass<A = any, B = A> {
  a: A;
  b: B;
}
interface GenericInterface<C = any, D = C> {
  c: C;
  d: D;
}
declare function genericFunction<E = any, F = E>(e: E): F;
declare type ConditionalInfer<G> = G extends Array<Array<infer H>> ? H : never;
declare type Mapped<I> = {
  [J in keyof I]: I[J];
};
declare type GenericType<K = any, L = K> = {
  k: K;
  l: L;
};
interface GenericExtends<M = any, N = M> extends GenericInterface<M, N> {}
export { type ConditionalInfer, type GenericExtends, type GenericInterface, GenericKlass, type GenericType, type Mapped, genericFunction };
