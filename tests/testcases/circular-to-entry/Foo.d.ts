import FooManager from ".";

declare class Foo {
  manager: FooManager;
  constructor(manager: FooManager);
}
export default Foo;
