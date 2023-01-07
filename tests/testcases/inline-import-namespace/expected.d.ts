declare class Bar {}
interface IBar {}
type __bar_Bar = Bar;
declare const __bar_Bar: typeof Bar;
type __bar_IBar = IBar;
declare namespace __bar {
  export {
    __bar_Bar as Bar,
    __bar_IBar as IBar,
  };
}
interface Foo {
  ns: typeof __bar;
}
export { Foo };
