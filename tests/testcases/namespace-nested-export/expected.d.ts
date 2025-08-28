interface External {
  id: string;
}
declare namespace Container {
  namespace Nested {
    type Local = External;
    export type FinalType = Local;
  }
}
export { Container };
