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
export { I, Ty, Cl, fn };
