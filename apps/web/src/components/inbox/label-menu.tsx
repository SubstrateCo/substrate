import {
  labelFilterModes,
  mailColors,
  type MailColor,
  type MailLabel,
} from "@substrate/contracts/mail";
import type { LabelDisplayChange } from "@substrate/contracts/mail/ipc";

import { useState } from "react";

import { defaultLabelColor, ink, labelName } from "./mail-colors";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ArrowLeft, ChevronRight, Ellipsis } from "lucide-react";
import { toast } from "sonner";

export type LabelActions = {
  onLabelColor: (mailbox: string, label: string, color: MailColor | null) => Promise<void>;
  onLabelVisibility: (mailbox: string, change: LabelDisplayChange) => Promise<void>;
};
const modeNames = { show: "Show", unread: "Show if unread", hide: "Hide" };
export function LabelMenu({
  mailboxId,
  label,
  onLabelColor,
  onLabelVisibility,
}: LabelActions & { mailboxId: string; label: MailLabel }) {
  const [colors, setColors] = useState(false);
  const [saving, setSaving] = useState(false);
  const name = `Options for ${labelName(label)}`;
  async function save(work: Promise<void>) {
    setSaving(true);
    try {
      await work;
    } catch {
      toast.error("Couldn’t save the label settings. Try again.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (open) setColors(false);
      }}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-xs" aria-label={name} disabled={saving}>
              <Ellipsis aria-hidden />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>{name}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent aria-label={name} align="end">
        {colors ? (
          <>
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                setColors(false);
              }}
            >
              <ArrowLeft aria-hidden />
              Label settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuRadioGroup
              aria-label="Label color"
              className="grid grid-cols-2"
              value={label.color ?? "auto"}
              onValueChange={(v) =>
                void save(
                  onLabelColor(mailboxId, label.id, mailColors.find((c) => c === v) ?? null),
                )
              }
            >
              <DropdownMenuRadioItem value="auto" className="col-span-2">
                Automatic ({defaultLabelColor(label)})
              </DropdownMenuRadioItem>
              {mailColors.map((c) => (
                <DropdownMenuRadioItem value={c} key={c}>
                  <span aria-hidden className={`size-3 rounded-sm bg-current ${ink[c]}`} />
                  {c}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </>
        ) : (
          <>
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                setColors(true);
              }}
            >
              <span
                aria-hidden
                className={`size-3 rounded-sm bg-current ${ink[label.color ?? defaultLabelColor(label)]}`}
              />
              Label color
              <ChevronRight className="ml-auto" aria-hidden />
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>In label list</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              aria-label="In label list"
              value={label.filterMode ?? "show"}
              onValueChange={(v) => {
                const mode = labelFilterModes.find((m) => m === v);
                if (mode)
                  void save(
                    onLabelVisibility(mailboxId, { area: "sidebar", labelId: label.id, mode }),
                  );
              }}
            >
              {labelFilterModes.map((mode) => (
                <DropdownMenuRadioItem key={mode} value={mode}>
                  {modeNames[mode]}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>In message list</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              aria-label="In message list"
              value={label.hideInRows ? "hide" : "show"}
              onValueChange={(v) =>
                void save(
                  onLabelVisibility(mailboxId, {
                    area: "rows",
                    labelId: label.id,
                    visible: v === "show",
                  }),
                )
              }
            >
              <DropdownMenuRadioItem value="show">Show</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="hide">Hide</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
