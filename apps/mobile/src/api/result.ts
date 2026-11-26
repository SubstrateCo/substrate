// oxlint-disable-next-line deslop/no-reexports-outside-entrypoints -- Stable app API facade shared by domain consumers.
export {
  ApiError,
  NetworkError,
  readResult,
  readResult as unwrapResponse,
} from "@substrate/contracts/http-result";
