import type { ExportFormat, ExportRecord, ExportValue } from "./export-types";
import { stringify } from "csv-stringify/sync";
import type { Context } from "hono";

function csvValue(value: ExportValue | undefined) {
  let text: string;
  if (value == null) text = "";
  else if (value instanceof Date) text = value.toISOString();
  else if (Array.isArray(value)) text = JSON.stringify(value);
  else text = String(value);
  // Spreadsheet apps can ignore whitespace and controls before a formula.
  return /^[\s\p{Cc}\p{Cf}]*[=+\-@]/u.test(text) ? `'${text}` : text;
}

export async function* exportChunks(
  records: AsyncIterable<ExportRecord>,
  columns: string[],
  format: ExportFormat,
) {
  const csv = (values: (ExportValue | undefined)[]) =>
    stringify([values.map(csvValue)], {
      quoted: true,
      quoted_empty: true,
      record_delimiter: "\r\n",
    });
  yield format === "json" ? "[\n" : csv(columns);
  let first = true;
  for await (const record of records) {
    yield format === "json"
      ? `${first ? "" : ",\n"}${JSON.stringify(record)}`
      : csv(columns.map((column) => record[column]));
    first = false;
  }
  if (format === "json") yield "\n]\n";
}

export function exportResponse(
  c: Context,
  data: { records: AsyncIterable<ExportRecord>; columns: string[] },
  format: ExportFormat,
  filename: string,
) {
  const chunks = exportChunks(data.records, data.columns, format);
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const next = await chunks.next();
        if (next.done) controller.close();
        else controller.enqueue(encoder.encode(next.value));
      } catch (error) {
        console.error(
          "Export stream failed",
          error instanceof Error ? error.name : "Unknown error",
        );
        controller.error(new Error("Export failed."));
      }
    },
    async cancel() {
      await chunks.return();
    },
  });
  return c.body(body, 200, {
    "Content-Type":
      format === "json" ? "application/json; charset=utf-8" : "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="${filename}.${format}"`,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
}
