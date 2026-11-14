import { APIError } from "better-auth/api";
import { z } from "zod";

export function normalizeUserName<T extends object>(data: T) {
  if (!("name" in data) || data.name === undefined) return data;
  const parsed = z.string().safeParse(data.name);
  if (!parsed.success) throw new APIError("BAD_REQUEST", { message: "Name must be a string." });
  const name = parsed.data.trim();
  if (!name) throw new APIError("BAD_REQUEST", { message: "Name must not be blank." });
  return { ...data, name };
}
