namespace ns {
  export interface Props<T> {
    foo: T;
  }
  export class Component<P> {
    props!: P;
  }
}
export default ns;
