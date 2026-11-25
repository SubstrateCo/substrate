/**
 * The files a paste should attach. Office apps put a picture of the copied text beside the text
 * itself, so a paste that carries text pastes the text and attaches nothing.
 */
export function pastedFiles({ files, text }: { files: File[]; text: string }, now = new Date()) {
  if (text.trim() || !files.length) return [];
  return files.map((file) => {
    // Screenshots and copied images arrive with a generic name such as "image.png".
    const match = /^image\.(\w+)$/.exec(file.name);
    if (!match) return file;
    const pad = (value: number) => String(value).padStart(2, "0");
    const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} at ${pad(now.getHours())}.${pad(now.getMinutes())}.${pad(now.getSeconds())}`;
    return new File([file], `Pasted image ${stamp}.${match[1]}`, {
      type: file.type,
      lastModified: file.lastModified,
    });
  });
}
