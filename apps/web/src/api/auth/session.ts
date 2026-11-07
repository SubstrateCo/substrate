import { api } from "../client";
import { readResult } from "../result";

export const getSession = (signal?: AbortSignal) =>
  readResult(api.session.$get({}, { init: { signal } }));
