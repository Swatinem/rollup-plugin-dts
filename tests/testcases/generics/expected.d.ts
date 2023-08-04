interface A {}
interface B {}
interface C {}
interface D {}
interface E {}
interface F {}
interface G {}
interface H {}
interface J {}
interface K {}
interface L {}
interface M {}
interface N {}
interface O {}
interface P {}
declare type Gen<T> = T;
interface I1<T = A> {
  a: T;
  b: Gen<B>;
}
declare type Ty<T = C> = {
  c: T;
  d: Gen<D>;
};
declare class Cl<T = E> {
  e: T;
  f: Gen<F>;
}
declare function fn<T = G>(g: T, h: Gen<H>): void;
declare type TyFn = <T = J>(j: T, k: Gen<K>) => L;
declare type TyCtor = new <T = M>(m: T, n: Gen<N>) => O;
interface I2 extends Gen<P> {}
export { Cl, type I1, type I2, type Ty, type TyCtor, type TyFn, fn };
