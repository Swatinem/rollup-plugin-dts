import * as Types from './types';

export namespace Container {
  export namespace Nested {
    // Import inside nested namespace with export keyword preserved
    import Local = Types.External;
    export type FinalType = Local;
  }
}
