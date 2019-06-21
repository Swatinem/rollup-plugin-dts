declare function fn(arg: string): string;
declare namespace fn {
    var staticProp: string;
}
declare function fn$1(arg: string): string;
declare namespace fn$1 {
    var staticProp: string;
}
export { fn as a, fn$1 as b };
