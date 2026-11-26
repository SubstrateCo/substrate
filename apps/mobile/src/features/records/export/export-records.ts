import type { CrmExport } from "@substrate/contracts/crm/export";

import { shareRecordExport } from "./export-session";
import { api } from "@/api/client";
import { shareTemporaryFile } from "@/api/files/platform";
import { privateFiles } from "@/api/files/private-files";
import { readResult } from "@/api/result";
import type { QueryScope } from "@/queries/keys";

export async function exportRecords(scope: QueryScope, input: CrmExport) {
  const format = input.format ?? "csv";
  const mimeType = format === "csv" ? "text/csv" : "application/json";
  const filename = `${input.kind}.${format}`;
  await shareRecordExport(
    (signal) =>
      privateFiles.load({
        scope,
        filename,
        mimeType,
        signal,
        load: async (signal) => {
          const options = { init: { signal } };
          const response =
            input.kind === "contacts"
              ? await api.contacts.export.$get({ query: { ...input, kind: "contacts" } }, options)
              : await api.crm.export.$get({ query: { ...input, kind: input.kind } }, options);
          if (!response.ok) await readResult(Promise.resolve(response));
          return new Uint8Array(await response.arrayBuffer());
        },
      }),
    (file) => shareTemporaryFile(file, filename, mimeType),
  );
}
