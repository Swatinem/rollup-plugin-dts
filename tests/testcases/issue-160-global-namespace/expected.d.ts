interface A {}
interface B {}
declare global {
  namespace Named.Core {
    export { A, B };
  }
  namespace Foo.Bar.Baz.Quux {
    export { A, B };
  }
}
export { A };
