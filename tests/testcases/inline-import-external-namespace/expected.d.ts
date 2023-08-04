import * as foo from 'foo';
interface Foo {
  ns1: foo;
  ns2: typeof foo;
}
export type { Foo };
