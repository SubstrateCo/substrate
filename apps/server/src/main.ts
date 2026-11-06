import { createApp } from "./app";

const port = Number(process.env.SERVER_PORT ?? "3001");
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("SERVER_PORT must be a valid port.");
}

const server = Bun.serve({ port, fetch: createApp().fetch });
console.log(`Startup OS API listening on ${server.url}`);
