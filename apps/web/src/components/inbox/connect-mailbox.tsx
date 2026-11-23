import { useState } from "react";

import { FormDialog } from "@/components/feedback/form-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export function ConnectMailbox({
  onConnect,
  onClose,
  onRestoreFocus,
  hasMailboxes,
}: {
  onConnect: (nickname: string, chooseClient: boolean) => Promise<boolean>;
  onClose: () => void;
  onRestoreFocus: () => void;
  hasMailboxes: boolean;
}) {
  const [nickname, setNickname] = useState("");
  const [chooseClient, setChooseClient] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  return (
    <FormDialog
      size="default"
      title="Connect Gmail"
      saveLabel="Continue with Google"
      description="If prompted, choose the Desktop app JSON you downloaded from Google Cloud. Then sign in with Google for read-only mail access."
      onClose={onClose}
      onRestoreFocus={onRestoreFocus}
      error={error}
      pending={pending}
      onSubmit={async () => {
        setPending(true);
        setError("");
        try {
          if (await onConnect(nickname.trim(), chooseClient)) onClose();
        } catch {
          setError(
            "Couldn’t connect Gmail. Check that the selected file is a Google Desktop app client and try again.",
          );
        } finally {
          setPending(false);
        }
      }}
    >
      <Field>
        <FieldLabel htmlFor="mailbox-nickname">Nickname (optional)</FieldLabel>
        <Input
          id="mailbox-nickname"
          maxLength={80}
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          placeholder="Use the email address"
        />
      </Field>
      {hasMailboxes && (
        <Field orientation="horizontal">
          <Checkbox
            id="choose-mail-client"
            checked={chooseClient}
            onCheckedChange={(v) => setChooseClient(v === true)}
          />
          <FieldLabel htmlFor="choose-mail-client">
            Choose a different Google client file
          </FieldLabel>
        </Field>
      )}
    </FormDialog>
  );
}
