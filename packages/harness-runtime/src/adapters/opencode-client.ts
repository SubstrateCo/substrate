import { HarnessError } from "../errors.ts";
import { launch, stopProcess } from "../process.ts";
import { OpenCode } from "@opencode/client";
import { randomBytes } from "node:crypto";
import { z } from "zod";

export async function startOpenCode(
  executable: string,
  directory: string,
  env: NodeJS.ProcessEnv = {},
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const password = randomBytes(32).toString("hex");
  const child = launch(
    executable,
    ["serve", "--stdio", "--hostname", "127.0.0.1", "--port", "0"],
    directory,
    { ...env, OPENCODE_SERVER_PASSWORD: password },
  );
  child.stderr.resume();
  const abort = () => {
    void stopProcess(child);
  };
  signal?.addEventListener("abort", abort, { once: true });
  try {
    const baseUrl = await new Promise<string>((resolve, reject) => {
      let buffer = "";
      const timer = setTimeout(
        () =>
          reject(new HarnessError("process-timeout", "OpenCode did not announce its endpoint.")),
        30_000,
      );
      const fail = () => {
        clearTimeout(timer);
        reject(
          new HarnessError("process-exit", "OpenCode stopped before announcing its endpoint."),
        );
      };
      child.once("error", fail);
      child.once("exit", fail);
      child.stdout.on("data", (chunk: Buffer) => {
        buffer += chunk.toString();
        if (buffer.length > 65536) {
          clearTimeout(timer);
          reject(
            new HarnessError("protocol-limit", "OpenCode startup output exceeded the size limit."),
          );
          return;
        }
        const newline = buffer.indexOf("\n");
        if (newline < 0) return;
        clearTimeout(timer);
        try {
          const endpoint = z.object({ url: z.url() }).parse(JSON.parse(buffer.slice(0, newline)));
          const url = new URL(endpoint.url);
          if (
            url.protocol !== "http:" ||
            url.hostname !== "127.0.0.1" ||
            url.username ||
            url.password ||
            url.pathname !== "/" ||
            url.search ||
            url.hash
          )
            throw new Error("Invalid endpoint");
          resolve(endpoint.url);
        } catch {
          reject(
            new HarnessError(
              "invalid-endpoint",
              "OpenCode did not announce a safe loopback endpoint.",
            ),
          );
        }
      });
    });
    return {
      client: OpenCode.make({
        baseUrl,
        headers: {
          authorization: `Basic ${Buffer.from(`opencode:${password}`).toString("base64")}`,
        },
      }),
      close: () => {
        signal?.removeEventListener("abort", abort);
        return stopProcess(child);
      },
    };
  } catch (error) {
    signal?.removeEventListener("abort", abort);
    await stopProcess(child);
    throw error;
  }
}
