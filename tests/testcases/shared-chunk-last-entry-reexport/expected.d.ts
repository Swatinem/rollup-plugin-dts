// entry-a.d.ts
import { Shared } from './entry-b.js';
declare const a: Shared;
export { a };
// entry-b.d.ts
import { S as Shared } from './shared.d-En--5LAw.js';
declare const b: Shared;
export { Shared, b };
// shared.d-En--5LAw.d.ts
declare class Shared {
  value: string;
}
export { Shared as S };
