import { createServer, type AddressInfo } from "node:net";

export async function availablePort() {
  const server = createServer();
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  // SAFETY: A listening TCP server bound to loopback reports an AddressInfo, not a pipe name.
  const port = (server.address() as AddressInfo).port;
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return port;
}
