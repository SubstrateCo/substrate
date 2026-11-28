import { useState } from "react";

import type { FilterClause, NumberFilterField } from "../types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const operators = ["equal to", "less than", "greater than", "between"] as const;

export function NumberEditor({
  field,
  clause,
  onChange,
  onDone,
}: {
  field: NumberFilterField;
  clause?: FilterClause;
  onChange: (clause: FilterClause) => void;
  onDone: () => void;
}) {
  const [operator, setOperator] = useState(
    operators.find((candidate) => candidate === clause?.operator) ?? "equal to",
  );
  const [start, setStart] = useState(clause?.values[0] ?? "1");
  const [end, setEnd] = useState(clause?.values[1] ?? clause?.values[0] ?? "1");
  const validNumber = (value: string) =>
    value !== "" &&
    Number.isInteger(Number(value)) &&
    Number(value) >= 0 &&
    Number(value) <= 1_000_000;
  const valid =
    validNumber(start) &&
    (operator !== "between" || (validNumber(end) && Number(end) >= Number(start)));
  return (
    <form
      className="grid gap-3 p-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!valid) return;
        onChange({ operator, values: operator === "between" ? [start, end] : [start] });
        onDone();
      }}
    >
      <div className="grid gap-2">
        <Label htmlFor={`${field.id}-operator`}>Condition</Label>
        <Select
          value={operator}
          onValueChange={(value) => {
            const next = operators.find((candidate) => candidate === value);
            if (next) setOperator(next);
          }}
        >
          <SelectTrigger
            id={`${field.id}-operator`}
            className="w-full"
            aria-label={`${field.label} comparison`}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(field.operators ?? operators).map((value) => (
              <SelectItem key={value} value={value}>
                {value.charAt(0).toUpperCase() + value.slice(1)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-start gap-2">
        <div className="grid min-w-0 flex-1 gap-2">
          <Label htmlFor={`${field.id}-count`}>
            {operator === "between" ? "Minimum count" : "Count"}
          </Label>
          <Input
            id={`${field.id}-count`}
            type="number"
            autoFocus
            min={0}
            max={1_000_000}
            step={1}
            value={start}
            onChange={(event) => setStart(event.target.value)}
          />
        </div>
        {operator === "between" && (
          <div className="grid min-w-0 flex-1 gap-2">
            <Label htmlFor={`${field.id}-until`}>Maximum count</Label>
            <Input
              id={`${field.id}-until`}
              type="number"
              min={Number(start)}
              max={1_000_000}
              step={1}
              value={end}
              onChange={(event) => setEnd(event.target.value)}
            />
          </div>
        )}
      </div>
      {operator === "between" && (
        <p className="text-xs text-muted-foreground">Includes both values.</p>
      )}
      <div className="flex items-center justify-end gap-2 border-t pt-3">
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={!valid}>
          Apply filter
        </Button>
      </div>
    </form>
  );
}
