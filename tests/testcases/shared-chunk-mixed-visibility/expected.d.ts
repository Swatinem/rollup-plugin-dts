// entry-a.d.ts
import { H as Hidden } from './entry-b.d-2AtcXeZ_.js';
import { Shared } from './entry-b.js';
declare const a: Shared;
declare const h: Hidden;
export { a, h };
// entry-b.d.ts
export { S as Shared } from './entry-b.d-2AtcXeZ_.js';
// entry-b.d-2AtcXeZ_.d.ts
declare class Shared {
  private _shared: string;
}
declare class Hidden {
  private _hidden: string;
}
export { Hidden as H, Shared as S };
