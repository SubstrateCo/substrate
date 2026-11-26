import type { PrivateFile, TemporaryFileInput } from "./resources";

export async function createTemporaryFile(input: TemporaryFileInput): Promise<PrivateFile> {
  const blob = new Blob([new Uint8Array(input.bytes)], { type: input.mimeType });
  const uri = URL.createObjectURL(blob);
  return { uri, release: () => URL.revokeObjectURL(uri) };
}

export async function shareTemporaryFile(file: PrivateFile, filename: string, _mimeType: string) {
  const link = document.createElement("a");
  link.href = file.uri;
  link.download = filename;
  document.body.appendChild(link);
  try {
    link.click();
    // Let the browser start consuming the blob before the caller revokes it.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  } finally {
    link.remove();
  }
}
