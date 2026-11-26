import { useState, type ReactNode } from "react";
import { FlatList, KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";

import { MutationError } from "./states";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { Check, Search } from "lucide-react-native";

const sheetContent = "max-h-[88%] w-full gap-0 p-0";

/**
 * A form in a dialog. Cancel, the close button, the overlay and the Android back button all ask
 * before they drop unsaved changes.
 */
export function FormSheet({
  title,
  description,
  saveLabel = "Save",
  dirty,
  pending,
  canSave = true,
  error,
  onSave,
  onClose,
  children,
}: {
  title: string;
  description?: string;
  saveLabel?: string;
  dirty: boolean;
  pending: boolean;
  canSave?: boolean;
  error?: unknown;
  onSave: () => void;
  onClose: () => void;
  children: ReactNode;
}) {
  const [confirming, setConfirming] = useState(false);
  const close = () => {
    if (pending) return;
    if (dirty) setConfirming(true);
    else onClose();
  };
  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent className={sheetContent}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          className="shrink"
        >
          <DialogHeader className="border-b border-border px-5 pb-3 pt-5 text-left">
            <DialogTitle className="pr-8 text-base">{title}</DialogTitle>
            {description ? <DialogDescription>{description}</DialogDescription> : null}
          </DialogHeader>
          <ScrollView
            className="shrink"
            contentContainerClassName="gap-4 p-5"
            keyboardShouldPersistTaps="handled"
          >
            <MutationError error={error} />
            {children}
          </ScrollView>
          <DialogFooter className="flex-row justify-end gap-2 border-t border-border px-5 py-3">
            <Button variant="outline" size="sm" onPress={close} disabled={pending}>
              <Text>Cancel</Text>
            </Button>
            <Button
              size="sm"
              onPress={onSave}
              disabled={pending || !canSave}
              accessibilityLabel={saveLabel}
            >
              <Text>{pending ? "Saving…" : saveLabel}</Text>
            </Button>
          </DialogFooter>
        </KeyboardAvoidingView>
      </DialogContent>
      {confirming ? (
        <ConfirmSheet
          title="Discard changes?"
          description="Your edits haven't been saved."
          confirmLabel="Discard"
          destructive
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false);
            onClose();
          }}
        />
      ) : null}
    </Dialog>
  );
}

/** A confirmation for a destructive or consequential action. It stays open while it works. */
export function ConfirmSheet({
  title,
  description,
  confirmLabel,
  destructive,
  pending,
  error,
  onCancel,
  onConfirm,
}: {
  title: string;
  description?: string;
  confirmLabel: string;
  destructive?: boolean;
  pending?: boolean;
  error?: unknown;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open onOpenChange={(open) => !open && !pending && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader className="text-left">
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description ? <AlertDialogDescription>{description}</AlertDialogDescription> : null}
        </AlertDialogHeader>
        <MutationError error={error} />
        <AlertDialogFooter className="flex-row justify-end">
          <AlertDialogCancel disabled={pending}>
            <Text>Cancel</Text>
          </AlertDialogCancel>
          <Button
            variant={destructive ? "destructive" : "default"}
            onPress={onConfirm}
            disabled={pending}
          >
            <Text>{pending ? "Working…" : confirmLabel}</Text>
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export type SheetAction = {
  label: string;
  onPress: () => void;
  destructive?: boolean;
  disabled?: boolean;
  hint?: string;
};

/** A list of actions for a record or row. */
export function ActionSheet({
  title,
  actions,
  onClose,
}: {
  title: string;
  actions: SheetAction[];
  onClose: () => void;
}) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className={sheetContent}>
        <DialogHeader className="px-5 pb-2 pt-5 text-left">
          <DialogTitle className="pr-8 text-sm" numberOfLines={2}>
            {title}
          </DialogTitle>
        </DialogHeader>
        <View className="pb-2">
          {actions.map((action) => (
            <Button
              key={action.label}
              variant="ghost"
              disabled={action.disabled}
              onPress={() => {
                onClose();
                action.onPress();
              }}
              className="h-auto min-h-12 flex-col items-start justify-center gap-0 rounded-none border-t border-border px-5 py-2"
            >
              <Text
                className={cn("text-[15px] font-normal", action.destructive && "text-destructive")}
              >
                {action.label}
              </Text>
              {action.hint ? (
                <Text className="text-xs font-normal text-muted-foreground">{action.hint}</Text>
              ) : null}
            </Button>
          ))}
        </View>
      </DialogContent>
    </Dialog>
  );
}

export type Choice<T extends string> = { value: T; label: string; description?: string };

/** A searchable single-choice list. */
export function PickerSheet<T extends string>({
  title,
  choices,
  value,
  onSelect,
  onClose,
  searchable = false,
  search,
  onSearch,
  loading,
  footer,
}: {
  title: string;
  choices: Choice<T>[];
  value: T | null | undefined;
  onSelect: (value: T) => void;
  onClose: () => void;
  searchable?: boolean;
  /** Controlled search, for lists the server filters. */
  search?: string;
  onSearch?: (value: string) => void;
  loading?: boolean;
  footer?: ReactNode;
}) {
  const [localSearch, setLocalSearch] = useState("");
  const query = search ?? localSearch;
  const filtered =
    onSearch || !query
      ? choices
      : choices.filter((choice) => choice.label.toLowerCase().includes(query.toLowerCase()));
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className={sheetContent}>
        <DialogHeader className="border-b border-border px-5 pb-3 pt-5 text-left">
          <DialogTitle className="pr-8 text-base">{title}</DialogTitle>
        </DialogHeader>
        {searchable ? (
          <View className="flex-row items-center gap-2 border-b border-border px-4 py-1.5">
            <Icon as={Search} className="size-4 text-muted-foreground" />
            <Input
              value={query}
              onChangeText={onSearch ?? setLocalSearch}
              placeholder="Search"
              autoCorrect={false}
              autoCapitalize="none"
              className="h-9 flex-1 border-0 bg-transparent px-0 shadow-none dark:bg-transparent"
              accessibilityLabel={`Search ${title.toLowerCase()}`}
            />
          </View>
        ) : null}
        <FlatList
          className="shrink"
          data={filtered}
          keyExtractor={(item) => item.value}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <Text className="p-6 text-center text-sm text-muted-foreground">
              {loading ? "Loading…" : "No matches"}
            </Text>
          }
          renderItem={({ item }) => (
            <Button
              variant="ghost"
              accessibilityLabel={item.label}
              accessibilityHint={item.description}
              accessibilityState={{ selected: item.value === value }}
              onPress={() => {
                onSelect(item.value);
                onClose();
              }}
              className="h-auto min-h-12 justify-start gap-3 rounded-none border-b border-border px-5 py-2"
            >
              <View className="flex-1">
                <Text className="text-[15px] font-normal" numberOfLines={1}>
                  {item.label}
                </Text>
                {item.description ? (
                  <Text className="text-xs font-normal text-muted-foreground" numberOfLines={1}>
                    {item.description}
                  </Text>
                ) : null}
              </View>
              {item.value === value ? <Icon as={Check} className="size-4 text-primary" /> : null}
            </Button>
          )}
        />
        {footer}
      </DialogContent>
    </Dialog>
  );
}
