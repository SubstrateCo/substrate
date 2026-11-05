export function formText(form: FormData, name: string): string {
  const value = form.get(name);
  if (value === null || value instanceof File)
    throw new Error(`A text value is required for ${name}.`);
  return value;
}
