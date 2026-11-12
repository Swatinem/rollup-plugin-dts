declare enum Kind {
  Ident = "ident",
  Call = "call",
}
interface Node {
  kind: Kind;
}
import foo_d_Kind = Kind;
type foo_d_Node = Node;
declare namespace foo_d {
  export { foo_d_Kind as Kind };
  export type { foo_d_Node as Node };
}
export { foo_d as foo };
