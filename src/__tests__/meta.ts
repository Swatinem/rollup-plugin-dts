export interface Meta {
  skip: boolean;
  debug: boolean;
}

export function defaultMeta(): Meta {
  return {
    skip: false,
    debug: false,
  };
}
