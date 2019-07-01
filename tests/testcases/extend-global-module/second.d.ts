declare global {
  namespace NodeJS {
    interface Global {
      second: Second;
    }
  }
}

// hm, for whatever reason, using `export` silences TS error `2669`
export interface Second {}
