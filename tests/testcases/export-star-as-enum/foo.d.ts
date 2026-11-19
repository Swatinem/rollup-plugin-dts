export declare enum Kind {
  Ident = "ident",
  Call = "call",
}
export interface Node {
  kind: Kind;
}
