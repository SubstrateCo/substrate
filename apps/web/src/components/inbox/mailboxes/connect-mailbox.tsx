import { useMutation } from "@tanstack/react-query";

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
  const connect = useMutation({
    mutationFn: (input: { nickname: string; chooseClient: boolean }) =>
      onConnect(input.nickname, input.chooseClient),
  });
  return (
    <FormDialog
      size="default"
      title="Connect Gmail"
      saveLabel="Continue with Google"
      description="Sign in with Google to read mail, mark messages as read, and move them to Trash. If prompted, choose your Google Desktop app client file."
      onClose={onClose}
      onRestoreFocus={onRestoreFocus}
      error={
        connect.isError
          ? "Couldn’t connect Gmail. Check that the selected file is a Google Desktop app client and try again."
          : ""
      }
      pending={connect.isPending}
      onSubmit={() =>
        connect.mutate(
          { nickname: nickname.trim(), chooseClient },
          {
            onSuccess: (connected) => {
              if (connected) onClose();
            },
          },
        )
      }
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
