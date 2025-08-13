import { Test } from './models';
import { test } from './test';
declare const b: ReturnType<typeof test<Test>> = test({ a: 's' });
export { b };
