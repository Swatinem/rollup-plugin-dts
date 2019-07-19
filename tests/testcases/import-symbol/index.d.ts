import { inspect } from 'util';

declare class Test {
  [inspect.custom](): string;
}

export { Test };
