interface A {
}
interface B {
}
interface C {
}
interface D {
}
interface E {
}
interface F {
}
interface G {
}
interface H {
}
interface J {
}
interface K {
}
interface L {
}
interface M {
}
interface N {
}
interface O {
}
declare type Gen<T> = T;
interface I<T = A> {
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
export { I, Ty, Cl, fn, TyFn, TyCtor };
