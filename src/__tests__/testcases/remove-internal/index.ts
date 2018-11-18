class B {}

export class Foo {
  /**
   * @internal
   */
  internal(): B {
    return new B();
  }
}

/**
 * @internal
 */
export class Internal {}
