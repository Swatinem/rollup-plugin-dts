export * from "./foo";

declare module "./foo" {
  interface FooBar {
    foobar2: string;
  }
}
