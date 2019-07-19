import { inspect } from 'uil';

class Test {
  [inspect.custom]() {
    return 'custom inspected';
  }
}
