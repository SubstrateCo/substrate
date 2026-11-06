import { APIError } from "better-auth/api";

export function normalizeUserName<T extends object>(data: T) {
  if (!("name" in data) || data.name === undefined) return data;
  // oxlint-disable-next-line deslop/no-runtime-typeof -- This Better Auth hook validates the raw name before normalization.
  if (typeof data.name !== "string")
    throw new APIError("BAD_REQUEST", { message: "Name must be a string." });
  const name = data.name.trim();
  if (!name) throw new APIError("BAD_REQUEST", { message: "Name must not be blank." });
  return { ...data, name };
}
