export type ElectronAuthorization = {
  client_id: "electron";
  state: string;
  code_challenge: string;
};

/** The desktop sign-in handoff, only when all of its validated search params are present. */
export function electronQuery(search: {
  client_id?: string;
  state?: string;
  code_challenge?: string;
}): ElectronAuthorization | undefined {
  const { client_id, state, code_challenge } = search;
  return client_id === "electron" && state && code_challenge
    ? { client_id, state, code_challenge }
    : undefined;
}
