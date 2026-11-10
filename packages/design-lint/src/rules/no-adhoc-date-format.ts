import { type AstNode, isRenderedChild, memberName, type NodeOf, type Rule } from "../ast.ts";
import { see } from "../design-doc.ts";

const USE_INSTEAD =
  'Render <Timestamp> from "@/components/time/timestamp" or <DueDate> from "@/components/time/due-date", or call a helper from "@/lib/format/date": formatRelativeTime (lists, activity), formatTime (messages), formatDateTime (records, tables), formatDayLabel (day dividers), formatFullTimestamp (tooltips), formatDueDate (date-only values).';
const WHY = "so the same moment reads differently on different screens.";

// Date-only methods: any call is date formatting.
const DATE_METHODS = new Set([
  "toLocaleDateString",
  "toLocaleTimeString",
  "toDateString",
  "toTimeString",
  "toUTCString",
  "toGMTString",
]);
const DATE_OPTIONS = new Set([
  "dateStyle",
  "timeStyle",
  "weekday",
  "year",
  "month",
  "day",
  "hour",
  "minute",
  "second",
  "timeZone",
  "timeZoneName",
]);
const isDateLikeName = (name: string) => /(?:date|time|day)$/i.test(name) || /[a-z]At$/.test(name);
const INTL_DATE_FORMATS = new Set(["DateTimeFormat", "RelativeTimeFormat"]);

function unwrap(node: AstNode): AstNode {
  return node.type === "ChainExpression" || node.type === "TSNonNullExpression"
    ? unwrap(node.expression)
    : node;
}

/** `toLocaleString` also formats numbers, so only date-looking receivers or options count. */
function formatsDate(call: NodeOf<"CallExpression">, receiver: AstNode) {
  const target = unwrap(receiver);
  if (target.type === "NewExpression" && target.callee.type === "Identifier")
    return target.callee.name === "Date";
  if (target.type === "Identifier" && isDateLikeName(target.name)) return true;
  const name = memberName(target);
  if (name && isDateLikeName(name)) return true;
  return call.arguments.some(
    (argument) =>
      argument.type === "ObjectExpression" &&
      argument.properties.some(
        (property) =>
          property.type === "Property" &&
          property.key.type === "Identifier" &&
          DATE_OPTIONS.has(property.key.name),
      ),
  );
}

function intlFormat(callee: AstNode) {
  const name = memberName(callee);
  if (!name || !INTL_DATE_FORMATS.has(name) || callee.type !== "MemberExpression") return undefined;
  return callee.object.type === "Identifier" && callee.object.name === "Intl" ? name : undefined;
}

/**
 * `Intl.DateTimeFormat().resolvedOptions()` reads the user's time zone, and a discarded
 * `new Intl.DateTimeFormat("en", { timeZone })` validates one. Neither formats a date.
 */
function formatsNothing(node: AstNode) {
  const parent = node.parent;
  if (parent?.type === "ExpressionStatement") return true;
  return parent?.type === "MemberExpression" && memberName(parent) === "resolvedOptions";
}

export const noAdhocDateFormat: Rule = {
  meta: {
    type: "suggestion",
    docs: { description: "Format dates only through the shared date module." },
    messages: {
      method: `{{method}}() formats a date outside the date module, ${WHY} ${USE_INSTEAD} ${see("3 Dates")}`,
      intl: `Intl.{{format}} builds a date format outside the date module, ${WHY} ${USE_INSTEAD} ${see("3 Dates")}`,
      isoText: `toISOString() puts the storage format ("2026-11-08T15:40:00.000Z") on screen. Keep it for dateTime attributes and API values only. ${USE_INSTEAD} ${see("3 Dates")}`,
    },
    schema: [],
  },
  create(context) {
    function checkIntl(node: NodeOf<"CallExpression"> | NodeOf<"NewExpression">) {
      const format = intlFormat(node.callee);
      if (!format || formatsNothing(node)) return;
      context.report({ node, messageId: "intl", data: { format } });
    }

    return {
      NewExpression: checkIntl,
      CallExpression(node) {
        checkIntl(node);
        const callee = unwrap(node.callee);
        const method = memberName(callee);
        if (!method || callee.type !== "MemberExpression") return;
        if (
          DATE_METHODS.has(method) ||
          (method === "toLocaleString" && formatsDate(node, callee.object))
        ) {
          context.report({ node, messageId: "method", data: { method } });
        } else if (method === "toISOString" && isRenderedChild(node)) {
          context.report({ node, messageId: "isoText" });
        }
      },
    };
  },
};
