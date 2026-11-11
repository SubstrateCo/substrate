import { ValidationError } from "../errors";

export function requiredText(value: string, maximum: number) {
  if (!value.trim() || value.trim().length > maximum)
    throw new ValidationError(`Enter text between 1 and ${maximum} characters.`);
  return value.trim();
}
