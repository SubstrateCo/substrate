import { useQuery } from "@tanstack/react-query";

import { pipelineOptions } from "./options";
import { resourceState } from "@/lib/resource-state";

export function useActiveStages(organizationId: string, enabled: boolean) {
  const pipeline = useQuery({ ...pipelineOptions(organizationId), enabled });
  const stages = (resourceState(pipeline).data ?? []).filter((stage) => !stage.retired);
  return {
    pipeline,
    stages,
    options: stages.map((stage) => ({ value: stage.id, label: stage.name })),
  };
}
