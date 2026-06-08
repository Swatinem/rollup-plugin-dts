// entry-a.d.ts
import { S as Shared, H as Hidden } from './entry-b.d-BU7AAKVR.js';
declare const a: Shared;
declare const h: Hidden;
export { Shared as PublicShared, a, h };
// entry-b.d.ts
export { S as Shared } from './entry-b.d-BU7AAKVR.js';
// entry-b.d-BU7AAKVR.d.ts
declare class Shared {
  private _id: string;
  get id(): string;
}
declare class Hidden {
  private _hidden: string;
}
export { Hidden as H, Shared as S };
