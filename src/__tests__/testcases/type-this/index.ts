class Foo {
  a: this;
}

export function thisType(this: Foo) {
  return;
}
