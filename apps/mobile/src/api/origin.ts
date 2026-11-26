export function serverOrigin(value: string | undefined) {
  if (!value) throw new Error("Set EXPO_PUBLIC_API_URL to the server's absolute HTTP(S) origin.");
  const url = new URL(value);
  const credentials = url.username || url.password;
  const extraPath = url.pathname !== "/" || url.search || url.hash;
  if (!["http:", "https:"].includes(url.protocol) || credentials || extraPath)
    throw new Error("EXPO_PUBLIC_API_URL must be an HTTP(S) origin without a path or credentials.");
  return url.origin;
}
