interface Props {
    title: string;
}
declare function Component(props: Props): any;
declare module "./index" {
  interface Props {
    extra?: boolean;
  }
}
export { Component };
export type { Props };
