import {
  mcpOutputOffloadBytes,
  type JsonObject,
  type OffloadedOutput,
} from "@substrate/contracts/harness-runtime";

import { safeId, safePath } from "./paths.ts";
import { writeFile } from "node:fs/promises";
import { z } from "zod";

const previewCharacters = 1000;
const listPage = z.looseObject({ items: z.array(z.unknown()).optional() });

function pagingNotes(
  page: z.output<typeof listPage>,
  label: string,
  pagingFields: readonly string[],
) {
  const count = page.items ? `${page.items.length} items, ` : "";
  return pagingFields.flatMap((field) =>
    field in page ? [`${label}${count}${field}: ${JSON.stringify(page[field] ?? null)}`] : [],
  );
}

function resultPaging(data: JsonObject, pagingFields: readonly string[]) {
  const parts: [string, unknown][] = [["", data], ...Object.entries(data)];
  const pages = parts.flatMap(([key, value]) => {
    const page = listPage.safeParse(value);
    return page.success ? pagingNotes(page.data, key ? `${key}: ` : "", pagingFields) : [];
  });
  return pages.length
    ? ` Paging: ${pages.join("; ")}. A non-null cursor means more pages follow.`
    : "";
}

export async function offloadOutput(
  folder: string,
  turnId: string,
  tool: string,
  sequence: number,
  data: JsonObject,
  pagingFields: readonly string[],
): Promise<OffloadedOutput | undefined> {
  const text = JSON.stringify(data);
  const bytes = Buffer.byteLength(text);
  if (bytes <= mcpOutputOffloadBytes) return undefined;
  if (!Number.isSafeInteger(sequence) || sequence < 1) throw new RangeError("Invalid sequence.");
  const path = `.substrate/outputs/${safeId(turnId)}/${safeId(tool)}-${sequence}.json`;
  await writeFile(await safePath(folder, path, false, true), text, { mode: 0o600 });
  return {
    summary: `${tool} returned ${bytes} bytes.${resultPaging(data, pagingFields)} The full JSON result is in ${path}; read that file for details. It starts with: ${text.slice(0, previewCharacters)}`,
    truncated: true,
    path,
    bytes,
  };
}
