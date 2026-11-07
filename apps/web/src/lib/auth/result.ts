export function unwrap<T>(result: {
  data: T;
  error: { message?: string; code?: string; status?: number } | null;
}): NonNullable<T> {
  if (result.error)
    throw Object.assign(
      new Error(result.error.message || "The request failed. Please try again."),
      { code: result.error.code, status: result.error.status },
    );
  if (result.data == null) throw new Error("No data was returned. Please try again.");
  return result.data;
}
