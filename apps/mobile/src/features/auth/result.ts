export function authResult<T>(result: {
  data: T;
  error: { message?: string; code?: string } | null;
}): NonNullable<T> {
  if (result.error) throw new Error(result.error.message || "The request failed. Try again.");
  if (result.data == null) throw new Error("The server returned no data. Try again.");
  return result.data;
}

export function errorMessage(error: Error | null): string {
  return error instanceof Error
    ? error.message
    : "Couldn't connect. Check your connection and try again.";
}
