import { privateScopePath, type PrivateFile, type TemporaryFileInput } from "./resources";
import { Directory, File, Paths } from "expo-file-system";
import { isAvailableAsync, shareAsync } from "expo-sharing";

let initialized = false;

export async function createTemporaryFile(input: TemporaryFileInput): Promise<PrivateFile> {
  const root = new Directory(Paths.cache, "substrate-private");
  if (!initialized) {
    if (root.exists) root.delete();
    root.create({ intermediates: true, idempotent: true });
    initialized = true;
  }
  const directory = new Directory(root, privateScopePath(input.scope), crypto.randomUUID());
  directory.create({ intermediates: true, idempotent: true });
  try {
    const file = new File(directory, input.filename);
    file.create();
    file.write(input.bytes);
    return {
      uri: file.uri,
      release: () => {
        if (directory.exists) directory.delete();
      },
    };
  } catch (error) {
    if (directory.exists) directory.delete();
    throw error;
  }
}

export async function shareTemporaryFile(file: PrivateFile, filename: string, mimeType: string) {
  if (!(await isAvailableAsync())) throw new Error("File sharing is not available on this device.");
  await shareAsync(file.uri, { mimeType, dialogTitle: filename });
}
