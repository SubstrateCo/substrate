import { APIError } from "better-auth/api";

export function normalizeUserName<T extends object>(data: T & { name?: string }) {
  if (data.name === undefined) return data;
  const name = data.name.trim();
  if (!name) throw new APIError("BAD_REQUEST", { message: "Name must not be blank." });
  return { ...data, name };
}
