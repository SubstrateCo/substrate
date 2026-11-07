import type { HarnessKind } from "@startup-os/contracts/harness";

import { harnessOptions } from "../harness-meta";
import { PendingButton } from "@/components/feedback/pending-button";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function DeviceConfiguration({
  available,
  loading,
  error,
  harness,
  pending,
  onHarnessChange,
  onScan,
}: {
  available: boolean;
  loading: boolean;
  error: Error | null;
  harness: HarnessKind;
  pending: boolean;
  onHarnessChange: (harness: HarnessKind) => void;
  onScan: () => void;
}) {
  return (
    <div className="grid gap-2">
      <h3 className="font-semibold">Device configuration</h3>
      <Field className="max-w-sm">
        <FieldLabel htmlFor="configuration-harness">Configuration harness</FieldLabel>
        <Select
          value={harness}
          disabled={pending || loading}
          onValueChange={(value) => {
            const option = harnessOptions.find((entry) => entry.value === value);
            if (option) onHarnessChange(option.value);
          }}
        >
          <SelectTrigger id="configuration-harness">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {harnessOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      {!available ? (
        <p role="status">Local configuration requires Electron and a selected organization.</p>
      ) : (
        <PendingButton
          className="justify-self-start"
          variant="outline"
          pending={loading}
          pendingLabel="Scanning"
          disabled={pending}
          onClick={onScan}
        >
          Scan local configuration
        </PendingButton>
      )}
      {error && (
        <p role="alert" className="text-destructive">
          {error.message}
        </p>
      )}
    </div>
  );
}
