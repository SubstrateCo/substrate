import { ruleTester } from "../test-support.ts";
import { noAdhocDateFormat } from "./no-adhoc-date-format.ts";

ruleTester.run("no-adhoc-date-format", noAdhocDateFormat, {
  valid: [
    // Numbers also have toLocaleString.
    "const label = count.toLocaleString();",
    "const label = stat.toLocaleString();",
    "const label = (total / 100).toLocaleString(undefined, { style: 'currency', currency: 'USD' });",
    // Reading the time zone does not format anything.
    "const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;",
    "const timezone = new Intl.DateTimeFormat().resolvedOptions().timeZone;",
    // Constructing a formatter only to validate a time zone.
    'function knownZone(zone) { try { new Intl.DateTimeFormat("en-US", { timeZone: zone }); return true; } catch { return false; } }',
    // ISO strings are for attributes and API values.
    "export const a = <time dateTime={date.toISOString()}>{formatTime(date)}</time>;",
    "const body = { readAt: new Date().toISOString() };",
    "const list = new Intl.ListFormat('en');",
  ],
  invalid: [
    {
      code: "export const a = <span>{new Date(task.createdAt).toLocaleString()}</span>;",
      errors: [
        {
          message:
            'toLocaleString() formats a date outside the date module, so the same moment reads differently on different screens. Render <Timestamp> from "@/components/time/timestamp" or <DueDate> from "@/components/time/due-date", or call a helper from "@/lib/format/date": formatRelativeTime (lists, activity), formatTime (messages), formatDateTime (records, tables), formatDayLabel (day dividers), formatFullTimestamp (tooltips), formatDueDate (date-only values). See apps/web/DESIGN.md § 3 Dates.',
        },
      ],
    },
    {
      code: "const label = task.dueDate.toLocaleDateString();",
      errors: [{ messageId: "method", data: { method: "toLocaleDateString" } }],
    },
    {
      code: "const label = message?.sentAt?.toLocaleTimeString([], { hour: 'numeric' });",
      errors: [{ messageId: "method", data: { method: "toLocaleTimeString" } }],
    },
    {
      // An unhelpful receiver name still counts when the options are date options.
      code: "const label = value.toLocaleString('en-US', { month: 'short', day: 'numeric' });",
      errors: [{ messageId: "method", data: { method: "toLocaleString" } }],
    },
    {
      code: "const label = updatedAt.toLocaleString();",
      errors: [{ messageId: "method", data: { method: "toLocaleString" } }],
    },
    {
      code: "const formatter = new Intl.DateTimeFormat('en', { dateStyle: 'medium' });",
      errors: [{ messageId: "intl", data: { format: "DateTimeFormat" } }],
    },
    {
      code: "const label = new Intl.RelativeTimeFormat('en').format(-1, 'day');",
      errors: [{ messageId: "intl", data: { format: "RelativeTimeFormat" } }],
    },
    {
      code: "export const a = <p>Due {task.due.toISOString()}</p>;",
      errors: [{ messageId: "isoText" }],
    },
    {
      code: "export const a = <p>{`Saved ${saved.toISOString()}`}</p>;",
      errors: [{ messageId: "isoText" }],
    },
  ],
});
