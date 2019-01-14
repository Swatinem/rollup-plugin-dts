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

type Gen<T> = T;

export interface I<T = A> {
  a: T;
  b: Gen<B>;
}
export type Ty<T = C> = {
  c: T;
  d: Gen<D>;
};
export class Cl<T = E> {
  e: T;
  f: Gen<F>;
}
export function fn<T = G>(g: T, h: Gen<H>) {}
export type TyFn = <T = J>(j: T, k: Gen<K>) => L;
export type TyCtor = new <T = M>(m: T, n: Gen<N>) => O;
