import { z } from "zod";

/** These forms contain text controls, never files. */
export function formText(form: FormData, name: string) {
  return z.string().catch("").parse(form.get(name)).trim();
}
