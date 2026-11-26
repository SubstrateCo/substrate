import { NavigationSurface } from "@/components/gestures/navigation-surface";
import { RecordDetail } from "@/features/records";
import type { RecordTarget } from "@/lib/navigation";

export function RecordPanel({
  organizationId,
  target,
  onOpenRecord,
  onClose,
  onOpenConversation,
}: {
  organizationId: string;
  target: RecordTarget;
  onOpenRecord: (target: RecordTarget) => void;
  onClose: () => void;
  onOpenConversation: (conversationId: string, messageId?: string) => void;
}) {
  return (
    <NavigationSurface key={`${target.kind}:${target.id}`} side="right" onClose={onClose}>
      {(close) => (
        <RecordDetail
          organizationId={organizationId}
          target={target}
          onOpenRecord={onOpenRecord}
          onClose={() => close()}
          onOpenConversation={(conversationId, messageId) =>
            close(() => onOpenConversation(conversationId, messageId))
          }
        />
      )}
    </NavigationSurface>
  );
}
