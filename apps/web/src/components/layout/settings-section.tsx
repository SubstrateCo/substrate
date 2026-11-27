import { useId, type ReactNode } from "react";

import { PendingButton } from "../feedback/pending-button";
import { toneBorder } from "@/components/feedback/tag-styles";
import { Button } from "@/components/ui/button";
import { FieldLabel } from "@/components/ui/field";
import { Heading } from "@/components/ui/heading";
import { Item, ItemActions, ItemContent } from "@/components/ui/item";
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
      className="grid min-w-0 gap-4 sm:gap-6"
    >
      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0 flex-1 basis-72 space-y-1 wrap-anywhere">
          <Heading level={2} variant="section" id={`${id}-title`}>
            {title}
          </Heading>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
        {/* Always on the title row's right edge, even when it wraps below a long description. */}
        {actions && (
          <div className="ml-auto flex max-w-full min-w-0 flex-wrap items-center justify-end gap-2">
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
        tone === "destructive" && toneBorder.destructive,
      )}
    >
      <div className={cn("grid min-w-0 gap-3 p-4 sm:gap-4 sm:p-5", className)}>
        {(title || description) && <GroupTitle id={`${id}-title`} {...{ title, description }} />}
        {children}
      </div>
      {footer && <div className="border-t bg-inset px-4 py-3 sm:px-5">{footer}</div>}
    </section>
  );
}

/**
 * The title and description of one group of settings. `actions` stay on the title row's right
 * edge, beside a long description instead of below it.
 */
export function GroupTitle({
  id,
  title,
  description,
  actions,
}: {
  id?: string;
  title?: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  const text = (
    <div className={cn("min-w-0 space-y-1 wrap-anywhere", actions && "flex-1 basis-48")}>
      {title && (
        <Heading level={3} id={id}>
          {title}
        </Heading>
      )}
      {description && <p className="text-sm text-muted-foreground">{description}</p>}
    </div>
  );
  if (!actions) return text;
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      {text}
      <div className="ml-auto flex max-w-full min-w-0 flex-wrap items-center gap-2">{actions}</div>
    </div>
  );
}

/** A form detail with a quiet description and a consistently aligned control column. */
export function SettingsDetail({
  title,
  description,
  children,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section
      aria-labelledby={id}
      className="grid min-w-0 gap-4 py-6 first:pt-0 last:pb-0 @3xl/content:grid-cols-3 @3xl/content:gap-6"
    >
      <div className="max-w-sm min-w-0 space-y-2">
        <Heading level={3} id={id}>
          {title}
        </Heading>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      <div className="min-w-0 @3xl/content:col-span-2">{children}</div>
    </section>
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
    <Item className="max-sm:-mx-3 max-sm:w-auto">
      <ItemContent className="min-w-0 basis-56 wrap-anywhere">
        {htmlFor ? (
          <FieldLabel htmlFor={htmlFor}>{label}</FieldLabel>
        ) : (
          <p className="font-medium">{label}</p>
        )}
        {description && <p className="text-muted-foreground">{description}</p>}
      </ItemContent>
      <ItemActions className="max-w-full min-w-0 flex-wrap">{control}</ItemActions>
    </Item>
  );
}

/** A bordered list of rows, such as skills, MCP servers, routines, or agent activity. */
export function SettingsList({
  title,
  description,
  label,
  hidden,
  children,
}: {
  title?: string;
  description?: ReactNode;
  /** The list's accessible name when it has no title. */
  label?: string;
  /** Hides the list from assistive technology, such as skeleton rows under a status. */
  hidden?: boolean;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <div className="grid min-w-0 gap-3">
      {(title || description) && <GroupTitle id={`${id}-title`} {...{ title, description }} />}
      <ul
        aria-label={label}
        aria-labelledby={title ? `${id}-title` : undefined}
        aria-hidden={hidden || undefined}
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
    <div className="flex items-start gap-3 rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">
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
      <div className="mr-auto min-w-0 text-sm wrap-anywhere">
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
      <div className="flex max-w-full min-w-0 flex-wrap gap-2">
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
          disabled={!dirty}
          onClick={onSave}
        >
          Save
        </PendingButton>
      </div>
    </footer>
  );
}
