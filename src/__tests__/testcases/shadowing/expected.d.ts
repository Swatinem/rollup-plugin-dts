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
export { GenericInterface, GenericKlass, genericFunction, ConditionalInfer, Mapped };
