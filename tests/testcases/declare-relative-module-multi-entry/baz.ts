export interface Baz {
  baz: string;
}

declare module "./bar" {
  interface Bar {
    bar2: string;
  }
}
