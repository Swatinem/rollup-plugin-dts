interface IBar {}
declare class Bar {}
type __bar_IBar = IBar;
type __bar_Bar = Bar;
declare const __bar_Bar: typeof Bar;
declare namespace __bar {
  export {
    __bar_IBar as IBar,
    __bar_Bar as Bar,
  };
}
interface Foo {
  ns: typeof __bar;
}
export { Foo };
