import { ruleTester } from "../test-support.ts";
import { noRawErrorMessage } from "./no-raw-error-message.ts";

ruleTester.run("no-raw-error-message", noRawErrorMessage, {
  valid: [
    'export const a = <p>{actionErrorMessage(error, "We couldn\'t delete the agent.")}</p>;',
    'export const a = <FormMessage error={error} errorDescription="We couldn\'t save." />;',
    'if (error.message === "Not found") redirect();',
    "console.error(error.message);",
    "export const a = <p>{message.body}</p>;",
    "export const a = <p>{target.data?.message}</p>;",
  ],
  invalid: [
    {
      code: "export const a = <p>{error.message}</p>;",
      errors: [
        {
          message:
            'error.message shows raw server or library text ("Request failed with status 409"). Pass the error to <FormMessage error={…} errorDescription="<what failed, in plain words>"> from "@/components/feedback/form-message", or render actionErrorMessage(error, "<specific fallback>") from "@/components/feedback/action-error-message" (also inside toast.error). See apps/web/DESIGN.md § 1 Destructive flow.',
        },
      ],
    },
    {
      code: 'export const a = <ContentNotice title="Couldn\'t load" description={catalog.error.message} />;',
      errors: [{ messageId: "raw", data: { source: "catalog.error" } }],
    },
    {
      code: "export const a = <p>{configuration.error?.message}</p>;",
      errors: [{ messageId: "raw", data: { source: "configuration.error" } }],
    },
    {
      code: "export const a = <p>{saveError?.message ?? 'Failed'}</p>;",
      errors: [{ messageId: "raw", data: { source: "saveError" } }],
    },
    {
      code: "toast.error(err.message);",
      errors: [{ messageId: "raw", data: { source: "err" } }],
    },
  ],
});
