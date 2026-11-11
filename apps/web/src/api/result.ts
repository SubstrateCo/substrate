import type { ServiceErrorCode, ServiceFailure, ServiceResult } from "@substrate/contracts/result";

export class ApiError extends Error {
  public readonly userMessage?: string;
  public readonly reason?: ServiceFailure["reason"];

  constructor(
    public readonly code: ServiceErrorCode,
    message: string,
    public readonly status: number,
    details: Pick<ServiceFailure, "userMessage" | "reason"> = {},
  ) {
    super(message);
    this.name = "ApiError";
    this.userMessage = details.userMessage;
    this.reason = details.reason;
  }
}

export class NetworkError extends Error {
  constructor(cause: unknown) {
    super("Couldn’t reach the server.", { cause });
    this.name = "NetworkError";
  }
}

export async function readResult<T>(
  response: Promise<{ status: number; json(): Promise<ServiceResult<T>> }>,
): Promise<T> {
  let resolved;
  try {
    resolved = await response;
  } catch (error) {
    if (error instanceof TypeError) throw new NetworkError(error);
    throw error;
  }
  const result = await resolved.json();
  if (!result.success) {
    throw new ApiError(result.error.code, result.error.message, resolved.status, result.error);
  }
  return result.data;
}
