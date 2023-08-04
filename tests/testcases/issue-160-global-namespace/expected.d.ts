interface A {}
interface B {}
declare global {
  namespace Named.Core {
    export type { A, B };
  }
  namespace Foo.Bar.Baz.Quux {
    export type { A, B };
  }
}
export type { A };
