interface Second {}
declare global {
  namespace NodeJS {
    interface Global {
      second: Second;
    }
  }
}
interface Second$1 {}
declare global {
  namespace NodeJS {
    interface Global {
      second2: Second$1;
    }
  }
}
interface Second$2 {}
declare module "foobar" {
  const second3: Second$2;
}
// all these have at least one `export`, which silences TS error `2669`
interface First {}
declare global {
  namespace NodeJS {
    interface Global {
      first: First;
    }
  }
}
declare const e: any;
export default e;
