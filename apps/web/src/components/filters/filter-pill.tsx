import { Fragment, useState } from "react";

import { FieldEditor } from "./editors/field-editor";
import { clauseLabel, fieldOperators, operatorLabel, summarizeClause } from "./filter-value";
import type { FilterClause, FilterField } from "./types";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Pressable } from "@/components/ui/pressable";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { X } from "lucide-react";

const segmentClassName =
  "flex h-full min-w-0 items-center gap-1 px-2 hover:bg-row-hover aria-expanded:bg-row-hover";

/**
 * One active filter as `[field │ operator │ value │ ×]`. The operator and value edit in place;
 * a required field has no remove button.
 */
export function FilterPill({
  field,
  clause,
  onChange,
}: {
  field: FilterField;
  clause: FilterClause;
  onChange: (clause: FilterClause | undefined) => void;
}) {
  const [editing, setEditing] = useState(false);
  const Icon = field.icon;
  const operators = fieldOperators(field);
  const count = clause.values.length;
  const operator = operatorLabel(clause.operator, count);
  const summary = summarizeClause(field, clause);
  return (
    <div
      role="group"
      aria-label={clauseLabel(field, clause)}
      className="flex h-7 max-w-full min-w-0 items-stretch overflow-hidden rounded-md border border-control-border bg-card text-xs"
    >
      <span className="flex shrink-0 items-center gap-1 px-2 text-muted-foreground">
        <Icon aria-hidden="true" className="size-3.5" />
        {field.label}
      </span>
      <Separator orientation="vertical" />
      {operators.length > 1 ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Pressable
              focus="inset"
              aria-label={`${field.label} operator: ${operator}`}
              className={`${segmentClassName} shrink-0 text-muted-foreground`}
            >
              {operator}
            </Pressable>
          </DropdownMenuTrigger>
          <DropdownMenuContent collisionPadding={8}>
            <DropdownMenuRadioGroup
              value={clause.operator}
              onValueChange={(next) => {
                const chosen = operators.find((candidate) => candidate === next);
                if (chosen) onChange({ ...clause, operator: chosen });
              }}
            >
              {operators.map((candidate) => (
                <DropdownMenuRadioItem key={candidate} value={candidate}>
                  {operatorLabel(candidate, count)}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <span className="flex shrink-0 items-center px-2 text-muted-foreground">{operator}</span>
      )}
      <Separator orientation="vertical" />
      <Popover open={editing} onOpenChange={setEditing}>
        <PopoverTrigger asChild>
          <Pressable
            focus="inset"
            aria-label={`${field.label}: ${summary.text}`}
            title={count > 1 ? summary.labels.join(", ") : undefined}
            className={`${segmentClassName} font-medium`}
          >
            {summary.icons.length > 0 && (
              // Option icons come unsized; bare icons take the field icon's size.
              <span
                aria-hidden="true"
                className="flex shrink-0 items-center gap-0.5 [&>svg]:size-3.5 [&>svg]:shrink-0"
              >
                {summary.icons.map(({ value, icon }) => (
                  <Fragment key={value}>{icon}</Fragment>
                ))}
              </span>
            )}
            <span className="min-w-0 truncate">{summary.text}</span>
          </Pressable>
        </PopoverTrigger>
        <PopoverContent
          variant="reference"
          align="start"
          collisionPadding={8}
          className={
            field.kind === "date"
              ? "max-h-(--radix-popover-content-available-height) w-auto overflow-y-auto"
              : "max-h-(--radix-popover-content-available-height) w-64"
          }
        >
          <FieldEditor
            field={field}
            clause={clause}
            onChange={onChange}
            onDone={() => setEditing(false)}
          />
        </PopoverContent>
      </Popover>
      {!field.required && (
        <>
          <Separator orientation="vertical" />
          <span className="flex shrink-0 items-center px-0.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Remove ${field.label} filter`}
                  onClick={() => onChange(undefined)}
                >
                  <X aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Remove {field.label} filter</TooltipContent>
            </Tooltip>
          </span>
        </>
      )}
    </div>
  );
}
