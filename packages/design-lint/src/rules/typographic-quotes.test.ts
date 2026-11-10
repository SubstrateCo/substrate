import { ruleTester } from "../test-support.ts";
import { typographicQuotes } from "./typographic-quotes.ts";

ruleTester.run("typographic-quotes", typographicQuotes, {
  valid: [
    "export const a = <h2>This invitation isn’t available</h2>;",
    'export const a = <Notice title="Couldn’t load collaboration" />;',
    // A class string or a code string is not copy.
    'export const a = <div className="[&_[data-slot=\'x\']]:p-2" data-id="it\'s" />;',
    "export const a = <p>No emoji match “ro”</p>;",
    // Single tokens, class strings, imports, keys, logs, and developer errors are code.
    'export const a = ["it\'s", { "don\'t": 1 }];',
    "export const a = <div className={`it's a [&_[data-slot='x']]:p-2 ${x}`} />;",
    'import a from "../it\'s a/path";',
    'console.warn("Couldn\'t parse this");',
    'throw new Error("The runtime doesn\'t know this zone");',
    "export const a = <p>{`No emoji match “${query}”`}</p>;",
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
    // Copy that is not a JSX attribute or text.
    {
      code: 'setError("We couldn\'t select these files. Please try again.");',
      errors: [{ messageId: "apostrophe" }],
    },
    {
      code: 'export const hidden = "A request you can\'t open";',
      errors: [{ messageId: "apostrophe" }],
    },
    {
      code: 'export const labels = { person: "Someone you can\'t see" };',
      errors: [{ messageId: "apostrophe" }],
    },
    {
      code: "export const a = (p: string) => `In ${p}, under a task you can't open`;",
      errors: [{ messageId: "apostrophe" }],
    },
    {
      code: 'export const a = <p>{open ? "Couldn\'t link" : null}</p>;',
      errors: [{ messageId: "apostrophe" }],
    },
    {
      code: "export const a = <Notice description={`We couldn't load ${name}.`} />;",
      errors: [{ messageId: "apostrophe" }],
    },
  ],
});
