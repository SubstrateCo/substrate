import type { SaveSkillInput } from "@startup-os/contracts/agents";
import { saveSkillInput } from "@startup-os/contracts/agents";
import type { HarnessSkill } from "@startup-os/contracts/harness";

import { useState } from "react";

import { EditorDialog } from "./editor-dialog";
import { Input } from "@/ui/primitives/input";
import { Label } from "@/ui/primitives/label";
import { Textarea } from "@/ui/primitives/textarea";

export function SkillEditor({
  skill,
  pending,
  onClose,
  onSave,
}: {
  skill?: HarnessSkill;
  pending: boolean;
  onClose: () => void;
  onSave: (input: SaveSkillInput) => Promise<void>;
}) {
  const [draft, setDraft] = useState<SaveSkillInput>(
    skill ?? { name: "", description: "", content: "" },
  );
  return (
    <EditorDialog
      title={skill ? "Edit skill" : "Create skill"}
      saveLabel="Save skill"
      description="Create a reusable custom skill in native files on this device."
      pending={pending}
      onClose={onClose}
      onSave={() => {
        const { id, ...fields } = draft;
        const parsed = saveSkillInput.omit({ id: true }).parse(fields);
        return onSave(id ? { ...parsed, id } : parsed);
      }}
    >
      <div className="grid gap-2">
        <Label htmlFor="skill-name">Skill name</Label>
        <Input
          id="skill-name"
          required
          maxLength={64}
          pattern="[a-z0-9]+(-[a-z0-9]+)*"
          aria-describedby="skill-name-hint"
          value={draft.name}
          onChange={(event) => setDraft({ ...draft, name: event.target.value })}
        />
        <p id="skill-name-hint" className="text-sm text-muted-foreground">
          Native skill name: lowercase words separated by hyphens.
        </p>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="skill-description">Description</Label>
        <Textarea
          id="skill-description"
          maxLength={2000}
          value={draft.description}
          onChange={(event) => setDraft({ ...draft, description: event.target.value })}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="skill-content">Skill content</Label>
        <Textarea
          id="skill-content"
          rows={10}
          maxLength={100000}
          value={draft.content}
          onChange={(event) => setDraft({ ...draft, content: event.target.value })}
        />
      </div>
    </EditorDialog>
  );
}
