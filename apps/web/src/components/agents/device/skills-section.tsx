import { type HarnessSkill } from "@substrate/contracts/harness-runtime";

import { useState, type ReactNode } from "react";

import { CatalogRow } from "../catalog/catalog-row";
import { openingName } from "../editors/skill-name";
import { BuiltInGroup, ConfigurationPage, ConfigurationSearch } from "./configuration-page";
import {
  configurationSections,
  matchesSearch,
  startupSkillsDescription,
} from "./configuration-section-copy";
import { StartupSkills } from "./startup-configuration";
import { SettingsList } from "@/components/layout/settings-section";
import { Button } from "@/components/ui/button";
import { Plus, RotateCcw } from "lucide-react";

function SkillList({
  skills,
  searching,
  removing,
  onEdit,
  onDelete,
}: {
  skills: readonly HarnessSkill[];
  searching: boolean;
  removing: boolean;
  onEdit: (id: string) => void;
  onDelete: (skill: { id: string; name: string }) => void;
}) {
  let empty = "No skills of your own yet. Create one to teach this agent a repeatable task.";
  if (searching) empty = "No skills match.";
  return (
    <SettingsList title={`${configurationSections.skills.listTitle} · ${skills.length}`}>
      {skills.length ? (
        skills.map((item) => {
          // The list, the editor and the delete prompt all name the skill by its file name.
          const name = openingName(item);
          return (
            <CatalogRow
              key={item.id}
              name={name}
              mono
              detail={item.description}
              disabled={removing}
              onEdit={() => onEdit(item.id)}
              onDelete={() => onDelete({ id: item.id, name })}
            />
          );
        })
      ) : (
        <li className="px-4 py-3 text-sm text-muted-foreground">{empty}</li>
      )}
    </SettingsList>
  );
}

export function SkillsSection({
  skills,
  managedSkills,
  scanned,
  available,
  fetching,
  refresh,
  status,
  resetting,
  removing,
  onReset,
  onCreate,
  onEdit,
  onDelete,
}: {
  skills: readonly HarnessSkill[];
  managedSkills: HarnessSkill[];
  scanned: boolean;
  available: boolean;
  fetching: boolean;
  refresh: ReactNode;
  status: ReactNode;
  /** A reset of the defaults is running. */
  resetting: boolean;
  /** A delete is running. */
  removing: boolean;
  onReset: () => void;
  onCreate: () => void;
  onEdit: (id: string) => void;
  onDelete: (skill: { id: string; name: string }) => void;
}) {
  const [query, setQuery] = useState("");
  const shown = skills.filter((skill) =>
    matchesSearch(query, openingName(skill), skill.description),
  );
  return (
    <ConfigurationPage
      description={configurationSections.skills.description}
      toolbar={
        <>
          {scanned && skills.length > 0 && (
            <ConfigurationSearch
              label="skills"
              count={skills.length}
              value={query}
              onChange={setQuery}
            />
          )}
          <div className="ml-auto flex items-center gap-2">
            {refresh}
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!available || resetting}
              onClick={onReset}
            >
              <RotateCcw />
              Reset defaults
            </Button>
            <Button type="button" size="sm" disabled={!available || fetching} onClick={onCreate}>
              <Plus />
              New skill
            </Button>
          </div>
        </>
      }
    >
      {status}
      {scanned && (
        <SkillList
          skills={shown}
          searching={!!query.trim()}
          removing={removing}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      )}
      {managedSkills.length > 0 && (
        <BuiltInGroup
          title="Substrate skills"
          count={managedSkills.length}
          description={startupSkillsDescription(scanned)}
        >
          <StartupSkills skills={managedSkills} scanned={scanned} />
        </BuiltInGroup>
      )}
    </ConfigurationPage>
  );
}
