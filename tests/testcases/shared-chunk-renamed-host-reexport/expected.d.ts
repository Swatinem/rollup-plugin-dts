// entry-a.d.ts
import { HostShared as Shared } from './entry-b.js';
declare const a: Shared;
export { a };
// entry-b.d.ts
declare class Shared {
  private _id: string;
  get id(): string;
}
export { Shared as HostShared };
