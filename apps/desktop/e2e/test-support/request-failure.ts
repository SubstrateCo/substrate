export function failRequestsAt(pathname: string) {
  const original = window.fetch;
  let failing = true;
  let failures = 0;
  window.fetch = Object.assign(async (...args: Parameters<typeof window.fetch>) => {
    const input = args[0];
    const url = new URL(input instanceof Request ? input.url : String(input), location.href);
    if (failing && url.pathname === pathname) {
      failures++;
      return Response.json(
        {
          success: false,
          error: { code: "INTERNAL_ERROR", message: "Internal connection details" },
        },
        { status: 500 },
      );
    }
    return original(...args);
  }, original);
  return {
    recover: () => {
      failing = false;
    },
    fail: () => {
      failing = true;
    },
    failures: () => failures,
  };
}
