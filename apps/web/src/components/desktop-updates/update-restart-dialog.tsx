import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";

export function UpdateRestartDialog({ version }: { version: string }) {
  return (
    <Dialog open>
      <DialogContent
        showCloseButton={false}
        onEscapeKeyDown={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Restarting to update</DialogTitle>
          <DialogDescription>
            Substrate will close and reopen with version {version}.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <div role="status" className="flex items-center gap-3 text-muted-foreground">
            <Spinner aria-hidden="true" />
            <span>Stopping agents and background services safely…</span>
          </div>
          <p className="text-sm text-muted-foreground">
            This can take a moment. You don’t need to click Update again.
          </p>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
