import { z } from "zod";

export function formText(form: FormData, name: string) {
  return z.string().catch("").parse(form.get(name)).trim();
}
