export function electronQuery(search: string) {
  const params = new URLSearchParams(search);
  const client_id = params.get("client_id");
  const state = params.get("state");
  const code_challenge = params.get("code_challenge");
  return client_id === "electron" && state && code_challenge
    ? { client_id, state, code_challenge }
    : undefined;
}
