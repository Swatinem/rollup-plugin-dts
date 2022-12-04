import url from 'url';
import path from 'path';

export default {
  options: {
    tsconfig: path.resolve(url.fileURLToPath(new URL('.', import.meta.url)), 'tsconfig.build.json')
  }
}
