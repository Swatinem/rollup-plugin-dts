import ns from "./ns";
interface G {}
export interface MyComponentProps extends ns.Props<G> {
  bar: string;
}
export declare class MyComponent extends ns.Component<MyComponentProps> {}
export {};
