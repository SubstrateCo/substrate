import { api } from "./client";
import { readResult } from "./result";

export const getAttention = (signal: AbortSignal) =>
  readResult(api.attention.$get({}, { init: { signal } }));
