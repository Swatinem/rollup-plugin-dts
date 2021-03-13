interface IBar {}
declare class Bar {}

var __bar = /*#__PURE__*/Object.freeze({
  __proto__: null,
  IBar: IBar,
  Bar: Bar
});

interface Foo {
  ns: typeof __bar;
}

export { Foo };
