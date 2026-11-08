export const referenceTokenPattern = /@\[(task|project|person|channel|thread):([0-9a-f-]{36})\]/gi;

export function referenceKey(kind: string, id: string): string {
  return `${kind}:${id}`;
}

export function plainReferenceText(text: string): string {
  return text.replace(/@\[[^\]]+\]/g, "[Reference]");
}
