import { Test } from './models';

export function test<T extends Test>(input: T): () => T {
  return () => input;
}
