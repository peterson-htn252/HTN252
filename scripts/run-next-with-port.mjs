#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawn } from "node:child_process";

// Launch Next.js in the current workspace with a configurable port.
const runMode = process.argv[2] ?? "dev";
const extraArgs = process.argv.slice(3);
const cwd = process.cwd();

let pkg = {};
try {
  const pkgRaw = readFileSync(resolve(cwd, "package.json"), "utf8");
  pkg = JSON.parse(pkgRaw);
} catch (error) {
  console.error("Unable to read package.json for", cwd);
  console.error(error);
  process.exit(1);
}

const defaultPort = pkg?.config?.port ?? "3000";
const port = process.env.PORT ?? String(defaultPort);

const child = spawn(
  "next",
  [runMode, "-p", port, ...extraArgs],
  {
    cwd,
    stdio: "inherit",
    env: { ...process.env, PORT: port },
  },
);

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  } else {
    process.exit(code ?? 0);
  }
});
