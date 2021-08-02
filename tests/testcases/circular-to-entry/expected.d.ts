declare class Foo {
  manager: FooManager;
  constructor(manager: FooManager);
}
declare class FooManager {
  foos: Array<Foo>;
  constructor();
}
export { FooManager as default };
