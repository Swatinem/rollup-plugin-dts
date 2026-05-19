// entry-a.d.cts
import { Shared } from './entry-b.cjs';
declare const a: Shared;
export { a };
// entry-b.d.cts
import { S as Shared } from './shared.d-En--5LAw.cjs';
declare const b: Shared;
export { Shared, b };
// shared.d-En--5LAw.d.cts
declare class Shared {
  value: string;
}
export { Shared as S };
