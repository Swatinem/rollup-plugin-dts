// Code is copied from here:
// https://github.com/rollup/rollup-plugin-typescript/blob/7f553800b90fc9abdcd13636b17b4824459d3960/src/resolveHost.js#L1-L18
import { statSync } from "fs";

export default {
  directoryExists(dirPath: string) {
    try {
      return statSync(dirPath).isDirectory();
    } catch (err) {
      return false;
    }
  },
  fileExists(filePath: string) {
    try {
      return statSync(filePath).isFile();
    } catch (err) {
      return false;
    }
  },
};
