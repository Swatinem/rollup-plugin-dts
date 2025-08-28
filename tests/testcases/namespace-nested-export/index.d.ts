import * as Types from './types';

export namespace Container {
  export namespace Nested {
    import Local = Types.External;
    export type FinalType = Local;
  }
}
