import { HarnessError } from "../errors.ts";
import { launch, stopProcess } from "../process.ts";
import { OpenCode } from "@opencode/client";
import { randomBytes } from "node:crypto";
import { z } from "zod";

const endpointAnnounce = z.object({ url: z.url() });

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
      // After the announce, later output is discarded; it must still drain so the child never blocks.
      const settled = () => {
        child.stdout.off("data", read);
        child.stdout.resume();
      };
      const read = (chunk: Buffer) => {
        buffer += chunk.toString();
        if (buffer.length > 65536) {
          settled();
          clearTimeout(timer);
          reject(
            new HarnessError("protocol-limit", "OpenCode startup output exceeded the size limit."),
          );
          return;
        }
        const newline = buffer.indexOf("\n");
        if (newline < 0) return;
        settled();
        clearTimeout(timer);
        try {
          const endpoint = endpointAnnounce.parse(JSON.parse(buffer.slice(0, newline)));
          const url = new URL(endpoint.url);
          const isLoopbackRoot =
            url.protocol === "http:" && url.hostname === "127.0.0.1" && url.pathname === "/";
          const hasCredentials = url.username || url.password;
          const hasQueryOrFragment = url.search || url.hash;
          if (!isLoopbackRoot || hasCredentials || hasQueryOrFragment)
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
      };
      child.stdout.on("data", read);
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
