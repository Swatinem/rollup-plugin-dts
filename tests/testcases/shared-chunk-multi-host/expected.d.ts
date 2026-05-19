// entry-a.d.ts
import { Shared } from './entry-b.js';
declare const a: Shared;
export { a };
// entry-b.d.ts
declare class Shared {
  private _id: string;
  get id(): string;
}
export { Shared };
// entry-c.d.ts
export { Shared } from './entry-b.js';
