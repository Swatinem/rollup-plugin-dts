// entry-a.d.ts
import { S as Shared } from './shared.d-BwjD5eaf.js';
declare const a: Shared;
export { Shared, a };
// entry-b.d.ts
import { S as Shared } from './shared.d-BwjD5eaf.js';
declare function accept(s: Shared): void;
export { Shared, accept };
// shared.d-BwjD5eaf.d.ts
declare class Shared {
  private _id: string;
  get id(): string;
}
export { Shared as S };
