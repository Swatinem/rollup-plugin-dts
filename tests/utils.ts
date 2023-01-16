import * as path from "path";
import * as fs from "fs";

export async function exists(path: string): Promise<boolean> {
  // do we really need a damn 6-liner for simple boolean fn?
  try {
    await fs.promises.access(path);
    return true;
  } catch {
    return false;
  }
}

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

function patchConsoleError() {
  const originalConsoleError = console.error;
  console.error = (message) => {
    throw new Error(message);
  };
  return () => {
    console.error = originalConsoleError;
  };
}

export class Harness {
  tests = new Map<string, (bless: boolean) => any>();

  constructor() {}

  test(name: string, fn: (bless: boolean) => any) {
    this.tests.set(name, fn);
  }

  async run(argv: Array<string>) {
    argv = argv.slice(2);
    let filter = "";
    let bless = false;
    for (const arg of argv) {
      if (arg === "--bless") {
        bless = true;
      } else {
        filter = arg;
      }
    }

    let failures: Array<{ name: string; error: Error }> = [];
    for (const [name, fn] of this.tests.entries()) {
      const restoreConsoleError = patchConsoleError();
      try {
        if (filter && !name.includes(filter)) {
          continue;
        }
        process.stdout.write(`${name}... `);
        await fn(bless);
        console.log(" ok");
      } catch (error) {
        failures.push({ name, error: error as any });
        console.log(" failed");
        console.log();
        console.log((error as any).stack);
        console.log();
      } finally {
        restoreConsoleError();
      }
    }

    if (failures.length) {
      console.log();
      console.error("Failures:");
      console.error();
      for (const { name } of failures) {
        console.error(`- ${name}`);
      }
    }

    return failures.length;
  }
}
