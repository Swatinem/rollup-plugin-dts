interface GetT {}
interface SetT {}
interface Thing {
  get size(): GetT;
  set size(value: GetT | SetT | boolean);
}
export type { Thing };
