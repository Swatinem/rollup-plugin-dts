interface External {
  id: string;
}
declare namespace Container {
  export namespace Nested {
    // Import inside nested namespace with export keyword preserved
    import Local = External;
    export type FinalType = Local;
  }
}
export { Container };
