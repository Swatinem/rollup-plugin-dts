export function trimExtension(path: string) {
  return path.replace(/((\.d)?\.(c|m)?(t|j)sx?)$/, "")
}