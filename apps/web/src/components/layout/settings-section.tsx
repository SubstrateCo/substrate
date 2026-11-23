import { useId, type ReactNode } from "react";

import { PendingButton } from "../feedback/pending-button";
import { Button } from "../ui/button";
import { cn } from "cn";

/** One settings page or tab: a title, a short description, optional actions, then its groups. */
export function SettingsSection({
  title,
  description,
  actions,
  label,
  children,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  /** Accessible name when it should differ from the visible title. */
  label?: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section
      aria-label={label}
      aria-labelledby={label ? undefined : `${id}-title`}
      className="grid min-w-0 gap-6"
    >
      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0 flex-1 basis-72 space-y-1">
          <h2 id={`${id}-title`} className="text-base font-semibold">
            {title}
          </h2>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
        {/* Always on the title row's right edge, even when it wraps below a long description. */}
        {actions && (
          <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-2">
            {actions}
          </div>
        )}
      </header>
      {children}
    </section>
  );
}

/** A bordered group of related settings. Its footer holds the actions that save the group. */
export function SettingsCard({
  title,
  description,
  label,
  tone = "default",
  footer,
  className,
  children,
}: {
  title?: string;
  description?: ReactNode;
  label?: string;
  tone?: "default" | "destructive";
  footer?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section
      aria-label={label}
      aria-labelledby={!label && title ? `${id}-title` : undefined}
      className={cn(
        "min-w-0 overflow-hidden rounded-xl border bg-card",
        tone === "destructive" && "border-destructive/30",
      )}
    >
      <div className={cn("grid min-w-0 gap-4 p-5", className)}>
        {(title || description) && <GroupTitle id={`${id}-title`} {...{ title, description }} />}
        {children}
      </div>
      {footer && <div className="border-t bg-muted/30 px-5 py-3">{footer}</div>}
    </section>
  );
}

/** The title and description of one group of settings. */
export function GroupTitle({
  id,
  title,
  description,
}: {
  id?: string;
  title?: string;
  description?: ReactNode;
}) {
  return (
    <div className="space-y-1">
      {title && (
        <h3 id={id} className="text-sm font-medium">
          {title}
        </h3>
      )}
      {description && <p className="text-sm text-muted-foreground">{description}</p>}
    </div>
  );
}

/**
 * One setting inside a card: the label and description on the left, its control on the right.
 * Pass `htmlFor` when the control is a single labelable element, such as a Switch.
 */
export function SettingsRow({
  label,
  description,
  htmlFor,
  control,
}: {
  label: string;
  description?: ReactNode;
  htmlFor?: string;
  control: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-6 gap-y-3">
      <div className="min-w-0 flex-1 basis-56 space-y-1">
        {htmlFor ? (
          <label htmlFor={htmlFor} className="text-sm font-medium">
            {label}
          </label>
        ) : (
          <p className="text-sm font-medium">{label}</p>
        )}
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      <div className="flex shrink-0 items-center">{control}</div>
    </div>
  );
}

/** A titled list of rows, such as skills or MCP servers. */
export function SettingsList({
  title,
  description,
  children,
}: {
  title?: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <div className="grid min-w-0 gap-3">
      {(title || description) && (
        <div className="space-y-1">
          {title && (
            <h3 id={`${id}-title`} className="text-sm font-medium">
              {title}
            </h3>
          )}
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
      )}
      <ul
        aria-labelledby={title ? `${id}-title` : undefined}
        className="divide-y overflow-hidden rounded-xl border bg-card"
      >
        {children}
      </ul>
    </div>
  );
}

/** A quiet note inside a section, such as "Open the desktop app". */
export function SettingsNote({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-dashed px-4 py-3 text-sm text-muted-foreground">
      {icon && <span className="mt-0.5 shrink-0 [&_svg]:size-4">{icon}</span>}
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/**
 * The one save footer for a settings card, in every area. The status is on the left: the error, or
 * "Unsaved changes" or "All changes saved". On the right, "Discard" (only when dirty) and a primary
 * "Save" that is disabled while nothing changed. Submits its form unless `onSave` is passed.
 */
export function SettingsFooter({
  dirty,
  pending = false,
  error,
  form,
  onSave,
  onDiscard,
}: {
  dirty: boolean;
  pending?: boolean;
  /** Reviewed copy for a failed save; replaces the status. */
  error?: ReactNode;
  /** The id of the form to submit when the footer sits outside it. */
  form?: string;
  onSave?: () => void;
  onDiscard: () => void;
}) {
  return (
    <footer className="flex w-full flex-wrap items-center justify-end gap-x-3 gap-y-2">
      <div className="mr-auto min-w-0 text-sm">
        {error ? (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        ) : (
          <p role="status" className="text-muted-foreground">
            {dirty ? "Unsaved changes" : "All changes saved"}
          </p>
        )}
      </div>
      <div className="flex shrink-0 gap-2">
        {dirty && (
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            // Keeps focus where it is, so discarding does not validate the field it leaves.
            onPointerDown={(event) => event.preventDefault()}
            onClick={onDiscard}
          >
            Discard
          </Button>
        )}
        <PendingButton
          type={onSave ? "button" : "submit"}
          form={form}
          pending={pending}
          pendingLabel="Saving"
          disabled={!dirty}
          onClick={onSave}
        >
          Save
        </PendingButton>
      </div>
    </footer>
  );
}
