interface IBar {
}
declare class Bar {
}
type _mp_rt0___bar___IBar = IBar;
type _mp_rt0___bar___Bar = Bar;
declare const _mp_rt0___bar___Bar: typeof Bar;
declare namespace _mp_rt0___bar__ {
  export {
    _mp_rt0___bar___IBar as IBar,
    _mp_rt0___bar___Bar as Bar,
  };
}
interface Foo {
    ns: typeof _mp_rt0___bar__;
}
export { Foo };
