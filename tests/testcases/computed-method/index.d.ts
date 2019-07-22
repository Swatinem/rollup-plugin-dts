import { inspect } from "util";
import { b } from "./b";
import * as mod from "./mod";

declare class Test {
  [inspect.custom](): string;
  [b](): string;
  [mod.deep.deep.a]: string;
}

export { Test };
