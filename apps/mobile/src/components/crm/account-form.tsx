import { useState } from "react";

import { TextField } from "@/features/records/ui/fields";
import { FormSheet } from "@/features/records/ui/sheet";

export type AccountDraft = {
  name: string;
  website: string | null;
  domain: string | null;
  summary: string;
};

export function AccountForm({
  account,
  pending,
  error,
  onSubmit,
  onClose,
}: {
  account?: AccountDraft;
  pending: boolean;
  error: Error | null;
  onSubmit: (draft: AccountDraft) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(account?.name ?? "");
  const [website, setWebsite] = useState(account?.website ?? "");
  const [domain, setDomain] = useState(account?.domain ?? "");
  const [summary, setSummary] = useState(account?.summary ?? "");
  const validWebsite = website.trim() === "" || /^https?:\/\/\S+$/i.test(website.trim());
  const dirty =
    name !== (account?.name ?? "") ||
    website !== (account?.website ?? "") ||
    domain !== (account?.domain ?? "") ||
    summary !== (account?.summary ?? "");
  return (
    <FormSheet
      title={account ? "Edit account" : "New account"}
      description={
        account
          ? undefined
          : "New accounts start with your access. Share them from the desktop app."
      }
      saveLabel={account ? "Save" : "Create"}
      dirty={dirty}
      pending={pending}
      canSave={name.trim().length > 0 && validWebsite}
      error={error}
      onClose={onClose}
      onSave={() =>
        onSubmit({
          name: name.trim(),
          website: website.trim() || null,
          domain: domain.trim() || null,
          summary,
        })
      }
    >
      <TextField
        label="Name"
        value={name}
        onChange={setName}
        maxLength={300}
        autoFocus={!account}
      />
      <TextField
        label="Website"
        value={website}
        onChange={setWebsite}
        placeholder="https://example.com"
        keyboardType="url"
        autoCapitalize="none"
        autoCorrect={false}
        error={validWebsite ? null : "Start with http:// or https://."}
      />
      <TextField
        label="Domain"
        value={domain}
        onChange={setDomain}
        placeholder="example.com"
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={253}
      />
      <TextField
        label="Summary"
        value={summary}
        onChange={setSummary}
        multiline
        maxLength={20000}
      />
    </FormSheet>
  );
}
