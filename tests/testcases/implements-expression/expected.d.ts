declare namespace ns {
  interface Props<T> {
    foo: T;
  }
  class Component<P> {
    props: P;
  }
}
interface G {}
interface MyComponentProps extends ns.Props<G> {
  bar: string;
}
declare class MyComponent extends ns.Component<MyComponentProps> {}
export { MyComponent, type MyComponentProps };
