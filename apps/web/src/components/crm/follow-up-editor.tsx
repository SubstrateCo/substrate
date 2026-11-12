import { useQuery } from "@tanstack/react-query";

import { useState } from "react";

import { CrmSelect } from "./crm-select";
import { formText } from "./form-text";
import { FormMessage } from "@/components/feedback/form-message";
import { PendingButton } from "@/components/feedback/pending-button";
import { NativeField, NativeForm } from "@/components/forms/native-form";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { resourceState } from "@/lib/resource-state";
import { useCrmMutation } from "@/queries/crm/mutations";
import { projectsQueryOptions } from "@/queries/tasks/options";

export function FollowUpEditor({
  organizationId,
  entityId,
  onClose,
}: {
  organizationId: string;
  entityId: string;
  onClose: () => void;
}) {
  const projects = useQuery(projectsQueryOptions(organizationId));
  const mutation = useCrmMutation(organizationId);
  const [projectId, setProjectId] = useState("");
  const [consent, setConsent] = useState(false);
  const [requestId] = useState(() => crypto.randomUUID());
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !mutation.isPending) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New follow-up</DialogTitle>
          <DialogDescription>
            Create a task in an existing project. It links back to this customer record. No email or
            calendar invitation is sent.
          </DialogDescription>
        </DialogHeader>
        <NativeForm
          pending={mutation.isPending}
          onSubmit={(form) => {
            if (!projectId || !consent) return;
            mutation.mutate(
              {
                action: "createFollowUp",
                organizationId,
                entityId,
                projectEntityId: projectId,
                requestId,
                title: formText(form, "title"),
                description: formText(form, "description"),
                dueDate: formText(form, "dueDate") || null,
                consentToTaskAudience: true,
              },
              { onSuccess: onClose },
            );
          }}
        >
          <DialogBody>
            <NativeField id="followup-title" name="title" label="Title" maxLength={300} required />
            <CrmSelect
              label="Project"
              value={projectId}
              onValueChange={setProjectId}
              options={(resourceState(projects).data ?? []).map((project) => ({
                value: project.entityId,
                label: project.name,
              }))}
              optional
            />
            <NativeField
              id="followup-due"
              name="dueDate"
              label="Due date"
              type="date"
              description="No date means unscheduled. Manage assignment and completion in the task."
            />
            <NativeField
              id="followup-description"
              name="description"
              label="Description"
              maxLength={20000}
            />
            <div className="flex items-start gap-2">
              <Checkbox
                id="followup-consent"
                checked={consent}
                onCheckedChange={(checked) => setConsent(checked === true)}
              />
              <Label htmlFor="followup-consent">
                I approve sharing this task’s title and description with the selected project’s
                readers, who may not have access to this customer record.
              </Label>
            </div>
            <FormMessage
              error={projects.error ?? mutation.error}
              errorDescription="Couldn’t create this follow-up. Check your project access and try again."
            />
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" disabled={mutation.isPending} onClick={onClose}>
              Cancel
            </Button>
            <PendingButton
              type="submit"
              pending={mutation.isPending}
              pendingLabel="Creating…"
              disabled={!projectId || !consent}
            >
              Create follow-up
            </PendingButton>
          </DialogFooter>
        </NativeForm>
      </DialogContent>
    </Dialog>
  );
}
