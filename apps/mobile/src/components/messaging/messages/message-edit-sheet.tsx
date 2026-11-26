import { messagingLimits } from "@substrate/contracts/messaging/input";

import { useState } from "react";
import { View } from "react-native";

import { ReferencePicker } from "../composer/reference-picker";
import { ReferenceTextInput } from "../composer/reference-text-input";
import { useReferenceEditing } from "../composer/use-reference-editing";
import { Text } from "@/components/ui/text";
import {
  bodyFromParts,
  partsFromBody,
  type ReferenceLabels,
} from "@/features/messaging/references/token-draft";
import { FormSheet } from "@/features/records/ui/sheet";

export function MessageEditSheet({
  organizationId,
  conversationId,
  body,
  labels,
  hasAttachments,
  pending,
  error,
  onSave,
  onClose,
}: {
  organizationId: string;
  conversationId: string;
  body: string;
  labels: ReferenceLabels;
  hasAttachments: boolean;
  pending: boolean;
  error: Error | null;
  onSave: (body: string) => void;
  onClose: () => void;
}) {
  const [parts, setParts] = useState(() => partsFromBody(body, labels));
  const { query, caretRequest, setCaret, pick } = useReferenceEditing(parts, setParts);
  const next = bodyFromParts(parts).trim();
  const valid = (!!next || hasAttachments) && next.length <= messagingLimits.body;
  return (
    <FormSheet
      title="Edit message"
      dirty={next !== body.trim()}
      pending={pending}
      canSave={valid && next !== body.trim()}
      error={error}
      onSave={() => onSave(next)}
      onClose={onClose}
    >
      <View className="rounded-lg border border-input">
        <ReferenceTextInput
          parts={parts}
          label="Message"
          placeholder="Message"
          editable={!pending}
          caretRequest={caretRequest}
          className="max-h-80 min-h-24"
          onChange={setParts}
          onCaret={setCaret}
        />
        {query ? (
          <ReferencePicker
            organizationId={organizationId}
            conversationId={conversationId}
            query={query}
            onPick={pick}
          />
        ) : null}
      </View>
      {!next && !hasAttachments ? (
        <Text className="text-xs text-destructive">A message without files needs text.</Text>
      ) : null}
    </FormSheet>
  );
}
