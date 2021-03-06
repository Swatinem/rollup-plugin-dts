declare function fn$1(arg: string): string;
declare namespace fn$1 {
  var staticProp: string;
}
declare function fn(arg: string): string;
declare namespace fn {
  var staticProp: string;
}
export { fn$1 as a, fn as b };
