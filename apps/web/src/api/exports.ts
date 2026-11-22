import type { contactsExport, crmRecordExport } from "@substrate/contracts/crm/export";
import type { projectExport } from "@substrate/contracts/tasks/export";
import type { AppType } from "@substrate/server/api";

import { hc } from "hono/client";
import type { z } from "zod";

// Hono's $url helper needs an absolute base; native downloads use the session's cookies.
function downloadApi() {
  return hc<AppType>(window.location.origin).api.v1;
}

export const crmExportUrl = (data: z.input<typeof crmRecordExport>) =>
  downloadApi().crm.export.$url({ query: data }).href;

export const contactsExportUrl = (data: z.input<typeof contactsExport>) =>
  downloadApi().contacts.export.$url({ query: data }).href;

export const projectExportUrl = (data: z.input<typeof projectExport>) =>
  downloadApi().tasks.export.$url({ query: data }).href;
