// Runs the PostgreSQL test suite through Neon's serverless driver (the one
// the app uses on Neon) against the local database, via a WebSocket proxy.
//
//   npm run test:db:neon
import { spawn } from "node:child_process";

import { startProxy } from "./ws-proxy.mjs";

const port = 5488;
const proxy = await startProxy(port);
// Asynchronous on purpose: the proxy runs in this process's event loop.
const child = spawn(
  process.execPath,
  ["node_modules/tsx/dist/cli.mjs", "--test", "tests/db/*.test.ts"],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      NEON_WS_PROXY: `127.0.0.1:${port}/v1`,
    },
  }
);
const code = await new Promise(resolve => child.on("exit", resolve));
proxy.close();
process.exit(code ?? 1);
