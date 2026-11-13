import type { ContactWrite } from "@substrate/contracts/contacts/input";

import { api, type ApiInput } from "../client";
import type { RecordListInput } from "../records/input";
import { readResult } from "../result";

export const listContacts = ({ data, signal }: ApiInput<RecordListInput>) =>
  readResult(api.contacts.$get({ query: { ...data, limit: "100" } }, { init: { signal } }));
export const getContact = ({
  data,
  signal,
}: ApiInput<{ organizationId: string; entityId: string }>) =>
  readResult(api.contacts.record.$get({ query: data }, { init: { signal } }));
export const mutateContact = ({ data, signal }: ApiInput<ContactWrite>) =>
  readResult(api.contacts.mutations.$post({ json: data }, { init: { signal } }));
