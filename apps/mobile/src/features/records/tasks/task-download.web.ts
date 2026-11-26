export async function prepareTaskDownload(filename: string) {
  return async (response: Pick<Response, "arrayBuffer" | "blob">) => {
    const url = URL.createObjectURL(await response.blob());
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
}
