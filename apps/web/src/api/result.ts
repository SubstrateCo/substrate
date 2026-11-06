import type { ServiceErrorCode, ServiceResult } from "@startup-os/contracts/result";

export class ApiError extends Error {
  constructor(
    public readonly code: ServiceErrorCode,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function readResult<T>(
  response: Promise<{ status: number; json(): Promise<ServiceResult<T>> }>,
): Promise<T> {
  const resolved = await response;
  const result = await resolved.json();
  if (!result.success) {
    throw new ApiError(result.error.code, result.error.message, resolved.status);
  }
  return result.data;
}
