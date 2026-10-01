// A minimal WebSocket → TCP proxy, so Neon's serverless driver can reach a
// local PostgreSQL. Development and tests only: Neon itself needs no proxy.
//
//   node scripts/db/ws-proxy.mjs            listens on 127.0.0.1:5488
//   NEON_WS_PROXY=127.0.0.1:5488/v1 npm run dev
//
// Same protocol as github.com/neondatabase/wsproxy: every binary message is
// relayed to and from the TCP address named in `?address=host:port`. Only
// local addresses are allowed, so it can never become an open relay.
import { createConnection } from "node:net";

import { WebSocketServer } from "ws";

const LOCAL = new Set(["localhost", "127.0.0.1", "::1"]);

export function startProxy(port = 5488) {
  const server = new WebSocketServer({ host: "127.0.0.1", port });
  server.on("connection", (socket, request) => {
    const address =
      new URL(request.url ?? "/", "http://proxy").searchParams.get("address") ??
      "";
    const cut = address.lastIndexOf(":");
    const host = address.slice(0, cut);
    const target = Number(address.slice(cut + 1));
    if (!LOCAL.has(host) || !Number.isInteger(target)) {
      socket.close(1008, "Only local PostgreSQL addresses are allowed");
      return;
    }
    const tcp = createConnection({ host, port: target });
    tcp.on("data", data => socket.send(data));
    socket.on("message", data => tcp.write(data));
    tcp.on("close", () => socket.close());
    tcp.on("error", () => socket.close());
    socket.on("close", () => tcp.destroy());
    socket.on("error", () => tcp.destroy());
  });
  return new Promise((resolve, reject) => {
    server.once("listening", () => resolve(server));
    server.once("error", reject);
  });
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/db/ws-proxy.mjs")) {
  const port = Number(process.argv[2] ?? 5488);
  await startProxy(port);
  console.log(
    `WebSocket proxy for the Neon driver on 127.0.0.1:${port} — NEON_WS_PROXY=127.0.0.1:${port}/v1`
  );
}
