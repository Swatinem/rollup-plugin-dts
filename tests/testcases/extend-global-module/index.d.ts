import "./second";

interface First {}

declare global {
  namespace NodeJS {
    interface Global {
      first: First;
    }
  }
}
