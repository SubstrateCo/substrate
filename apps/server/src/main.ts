import { createApp } from "./app";
import { defaultFileService } from "./v1/files/default-service";

const port = Number(process.env.SERVER_PORT ?? "3001");
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("SERVER_PORT must be a valid port.");
}

const server = Bun.serve({ port, fetch: createApp().fetch });
console.log(`Startup OS API listening on ${server.url}`);

let cleaningStorage = false;
async function cleanupStorage() {
  if (cleaningStorage) return;
  cleaningStorage = true;
  try {
    await defaultFileService.cleanup();
  } catch (error) {
    console.error("Storage cleanup failed", error instanceof Error ? error.name : "Unknown error");
  } finally {
    cleaningStorage = false;
  }
}
void cleanupStorage();
setInterval(() => void cleanupStorage(), 60 * 60_000).unref();
