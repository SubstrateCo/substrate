import type { ReactNode } from "react";

import type { ProjectDetail } from "../../types";

export function ProjectSettings({
  detail,
  canEdit,
  renderEditor,
  renderSettings,
}: {
  detail: ProjectDetail;
  canEdit: boolean;
  renderEditor: (detail: ProjectDetail) => ReactNode;
  renderSettings: (detail: ProjectDetail) => ReactNode;
}) {
  return (
    <div className="w-full min-w-0 space-y-6">
      {canEdit && renderEditor(detail)}
      {renderSettings(detail)}
    </div>
  );
}
