import { authError } from "./error";

export function unwrap<T>(result: {
  data: T;
  error: { message?: string; code?: string; status?: number } | null;
}): NonNullable<T> {
  if (result.error) throw authError(result.error);
  if (result.data == null) throw new Error("No data was returned. Please try again.");
  return result.data;
}
