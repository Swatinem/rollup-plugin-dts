import { GetT, SetT } from "./foo";

export interface Thing {
  get size(): GetT;
  set size(value: GetT | SetT | boolean);
}
