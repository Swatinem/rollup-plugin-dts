export interface Second {}

declare global {
  namespace NodeJS {
    interface Global {
      second2: Second;
    }
  }
}
