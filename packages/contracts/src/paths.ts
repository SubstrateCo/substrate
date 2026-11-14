/** Whether a decoded path contains a backslash, a space, or an ASCII control character. */
export function hasUnsafePathCharacter(path: string) {
  for (const character of path) {
    const code = character.charCodeAt(0);
    if (code <= 0x20 || code === 0x7f || character === "\\") return true;
  }
  return false;
}
