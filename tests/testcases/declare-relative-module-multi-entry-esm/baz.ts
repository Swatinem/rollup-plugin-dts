export interface Baz {
  baz: string;
}

declare module "./bar.js" {
  interface Bar {
    bar2: string;
  }
}
