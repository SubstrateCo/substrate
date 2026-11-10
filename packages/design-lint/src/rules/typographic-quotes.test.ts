import { ruleTester } from "../test-support.ts";
import { typographicQuotes } from "./typographic-quotes.ts";

ruleTester.run("typographic-quotes", typographicQuotes, {
  valid: [
    "export const a = <h2>This invitation isn’t available</h2>;",
    'export const a = <Notice title="Couldn’t load collaboration" />;',
    // A class string or a code string is not copy.
    'export const a = <div className="[&_[data-slot=\'x\']]:p-2" data-id="it\'s" />;',
    "export const a = <p>No emoji match “ro”</p>;",
  ],
  invalid: [
    {
      code: "export const a = <h2>This reset link doesn't work</h2>;",
      errors: [{ messageId: "apostrophe" }],
    },
    {
      code: 'export const a = <Notice description="We couldn\'t save your name." />;',
      errors: [{ messageId: "apostrophe" }],
    },
    {
      code: 'export const a = <p>No emoji match "ro"</p>;',
      errors: [{ messageId: "quotes" }],
    },
  ],
});
