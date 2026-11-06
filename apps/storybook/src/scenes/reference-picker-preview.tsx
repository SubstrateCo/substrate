import { useState } from "react";
import { ReferencePicker, type ReferenceKind } from "@startup-os/ui/messaging/reference-picker";
import { referenceFixtures } from "./reference-fixtures";

export function ReferencePickerPreview({
  initialQuery,
  onInsert,
  onClose,
}: {
  initialQuery: string;
  onInsert: (token: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [kind, setKind] = useState<ReferenceKind>("task");
  return (
    <ReferencePicker
      query={query}
      kind={kind}
      onQueryChange={setQuery}
      onKindChange={setKind}
      results={referenceFixtures
        .filter(
          (item) => item.kind === kind && item.label.toLowerCase().includes(query.toLowerCase()),
        )
        .map((item) => ({ id: item.id, title: item.label }))}
      onInsert={onInsert}
      onClose={onClose}
    />
  );
}
