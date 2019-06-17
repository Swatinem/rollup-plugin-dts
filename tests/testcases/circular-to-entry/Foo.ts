import FooManager from "./";

export default class Foo {
  public manager: FooManager;

  constructor(manager: FooManager) {
    this.manager = manager;

    // ...
  }
}
