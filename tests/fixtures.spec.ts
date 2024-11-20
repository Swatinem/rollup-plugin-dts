import { execSync } from "node:child_process";
import { resolve } from "node:path";

import { expect, test, describe } from "vitest";
import fs from "node:fs";

describe('fixtures', () => {
  test('project-with-references', () => {
    const resolveByPkg = (...paths: string[]) => resolve(process.cwd(), './fixtures/project-with-references', ...paths);
    if (fs.existsSync(resolveByPkg('node_modules')))
      fs.rmdirSync(resolveByPkg('node_modules'), { recursive: true });

    execSync('npm i', {
      cwd: resolveByPkg(),
      stdio: 'inherit'
    });
    execSync('npm run build', {
      cwd: resolveByPkg(),
      stdio: 'inherit'
    });

    fs.rmdirSync(resolveByPkg('./node_modules'), { recursive: true });
    const files = fs.readdirSync(resolveByPkg('./dist'));
    expect(files).toMatchSnapshot();
    files.forEach(file => {
      expect(fs.readFileSync(resolveByPkg('./dist', file), 'utf-8')).toMatchSnapshot();
    });
    fs.rmdirSync(resolveByPkg('./dist'), { recursive: true });
  })
})
