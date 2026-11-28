import { useRef, useState, type ReactNode } from "react";
import { FlatList, Platform, ScrollView, View } from "react-native";

import {
  chooseOption,
  canAddFilter,
  clearFilters,
  dateRangeError,
  entryOperator,
  filterEntry,
  filterLabel,
  hasClearableFilters,
  numberError,
  parseNumber,
  summarizeEntry,
  withValues,
  type AnyFilterField,
  type DateRange,
  type DateRangeFilterField,
  type FilterEntry,
  type FilterField,
  type FilterFieldOf,
  type FilterFieldValue,
  type FilterValues,
  type NumberFilterField,
} from "../filters";
import { validDate } from "../format";
import { scrollEdges, type ScrollEdges, type ScrollMetrics } from "../scroll-edges";
import { DateField, TextField } from "./fields";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  ListFilter,
  Square,
  SquareCheck,
  X,
} from "lucide-react-native";

const compact = "h-8 min-h-8 rounded-md shadow-none";
const hitSlop = 6;

export function FilterBar<V extends FilterValues>({
  fields,
  value,
  onChange,
  label = "Filters",
  trailing,
}: {
  fields: readonly FilterFieldOf<V>[];
  value: V;
  onChange: (value: V) => void;
  label?: string;
  trailing?: ReactNode;
}) {
  const [open, setOpen] = useState<{ fieldId: string | null } | null>(null);
  return (
    <View className="flex-row items-center border-b border-border bg-background">
      <ScrollHintRow label={label}>
        {canAddFilter(fields, value) ? (
          <Button
            variant="outline"
            size="sm"
            hitSlop={hitSlop}
            onPress={() => setOpen({ fieldId: null })}
            accessibilityLabel="Filter"
            className={cn(compact, "gap-1.5 px-2.5")}
          >
            <Icon as={ListFilter} className="size-4 text-muted-foreground" />
            <Text className="text-[13px]">Filter</Text>
          </Button>
        ) : null}
        {fields.map((field) => {
          const entry = filterEntry(field, value);
          if (!entry) return null;
          return (
            <FilterPill
              key={field.id}
              entry={entry}
              onPress={() => setOpen({ fieldId: field.id })}
              onRemove={() => onChange(withValues(value, field.id, undefined))}
            />
          );
        })}
        {hasClearableFilters(fields, value) ? (
          <Button
            variant="ghost"
            size="sm"
            hitSlop={hitSlop}
            onPress={() => onChange(clearFilters(fields, value))}
            className={cn(compact, "px-2")}
          >
            <Text className="text-[13px] text-muted-foreground">Clear filters</Text>
          </Button>
        ) : null}
        {/* An end inset, so the last item never sits flush against the edge. A spacer, because
            some browsers drop end padding from a scrolling row. */}
        <View className="w-2" />
      </ScrollHintRow>
      {trailing ? <View className="shrink-0">{trailing}</View> : null}
      {open ? (
        <FilterSheet
          fields={fields}
          value={value}
          onChange={onChange}
          fieldId={open.fieldId}
          onClose={() => setOpen(null)}
        />
      ) : null}
    </View>
  );
}

function ScrollHintRow({ label, children }: { label: string; children: ReactNode }) {
  const metrics = useRef<ScrollMetrics>({ offset: 0, viewport: 0, content: 0 });
  const [edges, setEdges] = useState<ScrollEdges>({ start: false, end: false });
  const update = (next: Partial<ScrollMetrics>) => {
    metrics.current = { ...metrics.current, ...next };
    const hidden = scrollEdges(metrics.current);
    setEdges((current) =>
      current.start === hidden.start && current.end === hidden.end ? current : hidden,
    );
  };
  return (
    <View className="flex-1">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        accessibilityLabel={label}
        contentContainerClassName="items-center gap-2 py-2 pl-3"
        keyboardShouldPersistTaps="handled"
        scrollEventThrottle={32}
        onLayout={(event) => update({ viewport: event.nativeEvent.layout.width })}
        onContentSizeChange={(width) => update({ content: width })}
        onScroll={(event) => {
          const { contentOffset, layoutMeasurement, contentSize } = event.nativeEvent;
          update({
            offset: contentOffset.x,
            viewport: layoutMeasurement.width,
            content: contentSize.width,
          });
        }}
      >
        {children}
      </ScrollView>
      {edges.start ? <EdgeFade side="start" /> : null}
      {edges.end ? <EdgeFade side="end" /> : null}
    </View>
  );
}

// Strips from the inner edge to the outer edge. Static class names, so Tailwind keeps them.
const fadeSteps = [
  "bg-background/10",
  "bg-background/25",
  "bg-background/40",
  "bg-background/60",
  "bg-background/80",
  "bg-background/95",
] as const;

function EdgeFade({ side }: { side: "start" | "end" }) {
  const steps = side === "end" ? fadeSteps : [...fadeSteps].reverse();
  return (
    <View
      pointerEvents="none"
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      className={cn("absolute inset-y-0 flex-row", side === "end" ? "right-0" : "left-0")}
    >
      {steps.map((step) => (
        <View key={step} className={cn("w-1", step)} />
      ))}
    </View>
  );
}

function FilterPill({
  entry,
  onPress,
  onRemove,
}: {
  entry: FilterEntry;
  onPress: () => void;
  onRemove: () => void;
}) {
  const { field } = entry;
  return (
    <View className="h-8 flex-row items-center overflow-hidden rounded-md border border-border bg-card">
      <Button
        variant="ghost"
        size="sm"
        hitSlop={hitSlop}
        onPress={onPress}
        accessibilityLabel={filterLabel(entry)}
        className={cn(compact, "gap-1 rounded-none px-2")}
      >
        {field.icon ? <Icon as={field.icon} className="size-3.5 text-muted-foreground" /> : null}
        <Text className="text-[13px] font-normal text-muted-foreground">{field.label}</Text>
        <Text className="text-[13px] font-normal text-muted-foreground">
          {entryOperator(entry)}
        </Text>
        <Text className="text-[13px] font-medium text-foreground" numberOfLines={1}>
          {summarizeEntry(entry)}
        </Text>
      </Button>
      {field.required ? null : (
        <Button
          variant="ghost"
          size="icon"
          hitSlop={hitSlop}
          onPress={onRemove}
          accessibilityLabel={`Remove ${field.label} filter`}
          className="size-8 rounded-none border-l border-border"
        >
          <Icon as={X} className="size-3.5 text-muted-foreground" />
        </Button>
      )}
    </View>
  );
}

function FilterSheet<V extends FilterValues>({
  fields,
  value,
  onChange,
  fieldId: initialFieldId,
  onClose,
}: {
  fields: readonly FilterFieldOf<V>[];
  value: V;
  onChange: (value: V) => void;
  fieldId: string | null;
  onClose: () => void;
}) {
  const [fieldId, setFieldId] = useState(initialFieldId);
  const field = fields.find((candidate) => candidate.id === fieldId);
  const fromList = initialFieldId === null;
  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[88%] w-full gap-0 p-0">
        <DialogHeader className="flex-row items-center gap-1 border-b border-border px-5 pb-3 pt-5 text-left">
          {field && fromList ? (
            <Button
              variant="ghost"
              size="icon"
              onPress={() => setFieldId(null)}
              accessibilityLabel="Back to filters"
              className="-my-2 -ml-3 size-10"
            >
              <Icon as={ChevronLeft} className="size-5 text-foreground" />
            </Button>
          ) : null}
          <DialogTitle className="flex-1 pr-8 text-base">{field?.label ?? "Filter"}</DialogTitle>
        </DialogHeader>
        {field ? (
          <FieldEditor
            key={field.id}
            field={field}
            entry={filterEntry(field, value)}
            // SAFETY: each editor returns the value type of its field's kind, which FilterFieldOf<V>
            // pairs with V[field.id].
            onApply={(next) => onChange(withValues(value, field.id, next as V[typeof field.id]))}
            onClose={onClose}
          />
        ) : (
          <FlatList
            className="shrink"
            data={fields}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => {
              const entry = filterEntry(item, value);
              return (
                <SheetRow
                  accessibilityLabel={entry ? filterLabel(entry) : item.label}
                  onPress={() => setFieldId(item.id)}
                >
                  {item.icon ? (
                    <Icon as={item.icon} className="size-4 text-muted-foreground" />
                  ) : null}
                  <Text className="flex-1 text-[15px] font-normal" numberOfLines={1}>
                    {item.label}
                  </Text>
                  {entry ? (
                    <Text className="text-sm font-normal text-muted-foreground" numberOfLines={1}>
                      {summarizeEntry(entry)}
                    </Text>
                  ) : null}
                  <Icon as={ChevronRight} className="size-4 text-muted-foreground" />
                </SheetRow>
              );
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function FieldEditor({
  field,
  entry,
  onApply,
  onClose,
}: {
  field: AnyFilterField;
  entry: FilterEntry | undefined;
  onApply: (value: FilterFieldValue) => void;
  onClose: () => void;
}) {
  if (field.kind === "date-range")
    return (
      <DateRangeEditor
        field={field}
        range={entry?.kind === "date-range" ? entry.value : undefined}
        onApply={(range) => {
          onApply(range);
          onClose();
        }}
      />
    );
  if (field.kind === "number")
    return (
      <NumberEditor
        field={field}
        value={entry?.kind === "number" ? entry.value : undefined}
        onApply={(next) => {
          onApply(next);
          onClose();
        }}
      />
    );
  return (
    <>
      <OptionValues
        field={field}
        values={entry?.kind === "option" ? entry.value : []}
        onChange={(values) => {
          onApply(values);
          if (!field.multiple) onClose();
        }}
      />
      {field.multiple ? (
        <DialogFooter className="flex-row justify-end border-t border-border px-5 py-3">
          <Button size="sm" onPress={onClose}>
            <Text>Done</Text>
          </Button>
        </DialogFooter>
      ) : null}
    </>
  );
}

function OptionValues({
  field,
  values,
  onChange,
}: {
  field: FilterField;
  values: readonly string[];
  onChange: (values: readonly string[]) => void;
}) {
  return (
    <FlatList
      className="shrink"
      data={field.options}
      keyExtractor={(item) => item.value}
      accessibilityLabel={field.label}
      ListEmptyComponent={
        <Text className="p-6 text-center text-sm text-muted-foreground">
          {field.loading ? "Loading…" : "Nothing to choose yet."}
        </Text>
      }
      renderItem={({ item }) => {
        const checked = values.includes(item.value);
        return (
          <SheetRow
            accessibilityLabel={item.label}
            checked={field.multiple ? checked : undefined}
            selected={field.multiple ? undefined : checked}
            onPress={() => onChange(chooseOption(field, values, item.value))}
          >
            {field.multiple ? (
              <Icon
                as={checked ? SquareCheck : Square}
                className={cn("size-4", checked ? "text-primary" : "text-muted-foreground")}
              />
            ) : null}
            <Text className="flex-1 text-[15px] font-normal" numberOfLines={1}>
              {item.label}
            </Text>
            {item.count !== undefined ? (
              <Text className="text-sm font-normal text-muted-foreground">{item.count}</Text>
            ) : null}
            {!field.multiple && checked ? (
              <Icon as={Check} className="size-4 text-primary" />
            ) : null}
          </SheetRow>
        );
      }}
    />
  );
}

function DateRangeEditor({
  field,
  range,
  onApply,
}: {
  field: DateRangeFilterField;
  range: DateRange | undefined;
  onApply: (range: DateRange) => void;
}) {
  const [draft, setDraft] = useState<DateRange>(range ?? { from: "", through: "" });
  const error = dateRangeError(draft);
  const shownError = validDate(draft.from) && validDate(draft.through) ? error : null;
  return (
    <>
      <View className="gap-3 px-5 py-4">
        <DateField
          label="From"
          value={draft.from}
          onChange={(from) => setDraft({ ...draft, from })}
          description=""
        />
        <DateField
          label="Through"
          value={draft.through}
          onChange={(through) => setDraft({ ...draft, through })}
          description=""
        />
        {shownError ? <Text className="text-xs text-destructive">{shownError}</Text> : null}
        {field.description && !shownError ? (
          <Text className="text-xs text-muted-foreground">{field.description}</Text>
        ) : null}
      </View>
      <ApplyFooter disabled={!!error} onPress={() => onApply(draft)} />
    </>
  );
}

function NumberEditor({
  field,
  value,
  onApply,
}: {
  field: NumberFilterField;
  value: number | undefined;
  onApply: (value: number) => void;
}) {
  const [text, setText] = useState(value === undefined ? "" : String(value));
  const parsed = parseNumber(field, text);
  const apply = () => {
    if (parsed !== null) onApply(parsed);
  };
  return (
    <>
      <View className="px-5 py-4">
        <TextField
          label={`${field.label} (${field.unit.other})`}
          value={text}
          onChange={setText}
          keyboardType="number-pad"
          maxLength={String(field.max).length}
          onSubmitEditing={apply}
          error={numberError(field, text)}
        />
      </View>
      <ApplyFooter disabled={parsed === null} onPress={apply} />
    </>
  );
}

function ApplyFooter({ disabled, onPress }: { disabled: boolean; onPress: () => void }) {
  return (
    <DialogFooter className="flex-row justify-end border-t border-border px-5 py-3">
      <Button size="sm" disabled={disabled} onPress={onPress}>
        <Text>Apply</Text>
      </Button>
    </DialogFooter>
  );
}

function SheetRow({
  accessibilityLabel,
  checked,
  selected,
  onPress,
  children,
}: {
  accessibilityLabel: string;
  checked?: boolean;
  selected?: boolean;
  onPress: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      variant="ghost"
      role={checked === undefined ? "button" : "checkbox"}
      accessibilityRole={checked === undefined ? "button" : "checkbox"}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={checked === undefined ? { selected } : { checked }}
      aria-checked={checked}
      aria-selected={selected}
      onPress={onPress}
      className={cn(
        "h-auto min-h-12 justify-start gap-3 rounded-none border-b border-border px-5 py-2",
        Platform.select({ web: "has-[>svg]:px-5" }),
      )}
    >
      {children}
    </Button>
  );
}
