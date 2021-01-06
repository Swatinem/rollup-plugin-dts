import * as path from "path";
import * as fs from "fs";

export function forEachFixture(fixtures: string, cb: (name: string, dir: string) => void): void {
  const dir = path.resolve(process.cwd(), "tests", fixtures);
  const dirs = fs.readdirSync(dir);
  for (const name of dirs) {
    const fixture = path.join(dir, name);
    if (fs.statSync(fixture).isDirectory()) {
      cb(name, fixture);
    }
  }
}

export class Harness {
  tests = new Map<string, () => any>();

  constructor() {}

  test(name: string, fn: () => any) {
    this.tests.set(name, fn);
  }

  async run(filter: string) {
    let failures: Array<{ name: string; error: Error }> = [];
    for (const [name, fn] of this.tests.entries()) {
      try {
        if (filter && !name.includes(filter)) {
          continue;
        }
        process.stdout.write(`${name}... `);
        await fn();
        console.log(" ok");
      } catch (error) {
        failures.push({ name, error });
        console.log(" failed");
      }
    }

    if (failures.length) {
      console.log();
      console.error("Failures:");
      console.error();
      for (const { name, error } of failures) {
        console.error(`- ${name}:`);
        console.error(error.stack);
        console.log();
      }
      console.log();
    }

    return failures.length;
  }
}
