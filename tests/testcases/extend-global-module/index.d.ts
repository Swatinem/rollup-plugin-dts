// all these have at least one `export`, which silences TS error `2669`
import "./second";
import "./second2";
import "./second3";

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
