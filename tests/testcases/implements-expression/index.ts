import ns from "./ns";

interface G {}

export interface MyComponentProps extends ns.Props<G> {
  bar: string;
}

export class MyComponent extends ns.Component<MyComponentProps> {}
