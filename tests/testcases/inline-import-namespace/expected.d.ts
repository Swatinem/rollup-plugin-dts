interface IBar {
}
declare class Bar {
}
type ɨmport0___bar___IBar = IBar;
type ɨmport0___bar___Bar = Bar;
declare const ɨmport0___bar___Bar: typeof Bar;
declare namespace ɨmport0___bar__ {
  export {
    ɨmport0___bar___IBar as IBar,
    ɨmport0___bar___Bar as Bar,
  };
}
interface Foo {
    ns: typeof ɨmport0___bar__;
}
export { Foo };
