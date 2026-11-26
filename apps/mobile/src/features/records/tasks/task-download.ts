import { Directory, File } from "expo-file-system";

export async function prepareTaskDownload(filename: string) {
  const directory = await Directory.pickDirectoryAsync();
  return async (response: Pick<Response, "arrayBuffer" | "blob">) => {
    const file = new File(directory, filename);
    file.create();
    file.write(new Uint8Array(await response.arrayBuffer()));
  };
}
