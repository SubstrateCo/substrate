import { fileURLToPath } from "node:url";
import { staticFilePath } from "./static";

const root = fileURLToPath(new URL("../../apps/storybook/storybook-static/", import.meta.url));
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: Number(process.argv[2]),
  async fetch(request) {
    const path = staticFilePath(root, new URL(request.url).pathname);
    if (!path) return new Response(null, { status: 403 });
    const file = Bun.file(path);
    if (!(await file.exists())) return new Response(null, { status: 404 });
    return new Response(file);
  },
});
console.log(`Storybook: ${server.url.href}`);
