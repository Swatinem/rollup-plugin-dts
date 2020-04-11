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
export interface I1<T = A> {
  a: T;
  b: Gen<B>;
}
export declare type Ty<T = C> = {
  c: T;
  d: Gen<D>;
};
export declare class Cl<T = E> {
  e: T;
  f: Gen<F>;
}
export declare function fn<T = G>(g: T, h: Gen<H>): void;
export declare type TyFn = <T = J>(j: T, k: Gen<K>) => L;
export declare type TyCtor = new <T = M>(m: T, n: Gen<N>) => O;
export interface I2 extends Gen<P> {}
export {};
