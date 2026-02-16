export * from "./foo.js";

declare module "./foo.js" {
  interface FooBar {
    foobar2: string;
  }
}
