import type { ToastOptions } from "./session";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { X } from "lucide-react-native";
import { toast } from "sonner-native";

let nextId = 0;

function DismissToast({ id }: { id: string }) {
  return (
    <Button
      variant="ghost"
      size="icon"
      accessibilityRole="button"
      accessibilityLabel="Dismiss notification"
      onPress={() => toast.dismiss(id)}
    >
      <Icon as={X} className="size-4 text-muted-foreground" />
    </Button>
  );
}

function show(kind: "success" | "error", title: string, options?: ToastOptions) {
  // Do not reuse IDs after private-state reset: an old close handler must never
  // dismiss a new account's toast.
  const id = `mobile-toast-${++nextId}`;
  return toast[kind](title, {
    ...options,
    id,
    action: options?.action ? (
      <Button
        variant="outline"
        className="mt-2 min-w-12 self-start"
        accessibilityRole="button"
        onPress={() => {
          options.action?.onClick();
          toast.dismiss(id);
        }}
      >
        <Text>{options.action.label}</Text>
      </Button>
    ) : undefined,
    close: <DismissToast id={id} />,
  });
}

export const toastDriver = {
  success: (title: string, options?: ToastOptions) => show("success", title, options),
  error: (title: string, options?: ToastOptions) => show("error", title, options),
  dismiss: () => toast.dismiss(),
};
