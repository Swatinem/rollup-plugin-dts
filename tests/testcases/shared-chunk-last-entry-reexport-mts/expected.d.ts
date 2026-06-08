// entry-a.d.mts
import { Shared } from './entry-b.mjs';
declare const a: Shared;
export { a };
// entry-b.d.mts
import { S as Shared } from './shared.d-En--5LAw.mjs';
declare const b: Shared;
export { Shared, b };
// shared.d-En--5LAw.d.mts
declare class Shared {
  value: string;
}
export { Shared as S };
