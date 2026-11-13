import type { LoadUser } from "../types";
import { request, type APIRequestContext, type APIResponse } from "@playwright/test";

export const config = {
  apiUrl: process.env.LOAD_API_URL ?? "http://localhost:3201",
  origin: process.env.LOAD_ORIGIN ?? "http://localhost:3200",
  mailpitUrl: process.env.LOAD_MAILPIT_URL ?? "http://localhost:8026",
  users: Number(process.env.LOAD_USERS ?? 200),
  password: process.env.LOAD_PASSWORD ?? "Substrate-Load-2026!Strong",
};

export interface Account extends LoadUser {
  client: APIRequestContext;
}

export async function client() {
  return request.newContext({
    baseURL: config.apiUrl,
    extraHTTPHeaders: { Origin: config.origin },
    timeout: 30_000,
  });
}

export async function json<T>(response: APIResponse): Promise<T> {
  if (!response.ok())
    throw new Error(`${response.url()}: ${response.status()} ${await response.text()}`);
  return response.json();
}

type RequestData = Record<string, string | number | boolean | string[] | null | undefined>;

export async function api<T>(
  client: APIRequestContext,
  path: string,
  data?: RequestData,
): Promise<T> {
  const response = data ? await client.post(path, { data }) : await client.get(path);
  const result = await json<{ success: boolean; data: T; error?: { message: string } }>(response);
  if (!result.success) throw new Error(`${path}: ${result.error?.message}`);
  return result.data;
}

export async function parallel<T>(
  items: readonly T[],
  action: (item: T, index: number) => Promise<void>,
) {
  let next = 0;
  const results = await Promise.allSettled(
    Array.from({ length: Math.min(8, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        await action(items[index]!, index);
      }
    }),
  );
  const failed = results.find((result) => result.status === "rejected");
  if (failed?.status === "rejected") throw failed.reason;
}
