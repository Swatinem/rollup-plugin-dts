interface A {}
class B {}

export class Foo {
  constructor(private a: A, protected b: B) {}
}
