import { type HarnessSkill } from "@substrate/contracts/harness-runtime";

import { useState, type ReactNode } from "react";

import { CatalogRow } from "../catalog/catalog-row";
import { openingName } from "../editors/skill-name";
import {
  BuiltInGroup,
  ConfigurationList,
  ConfigurationPage,
  ConfigurationSearch,
} from "./configuration-page";
import { configurationSections, matchesSearch } from "./configuration-section-copy";
import { StartupSkills } from "./startup-configuration";
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
  let empty = "No skills yet. Add one to teach the agent a repeatable task.";
  if (searching) empty = "No skills match.";
  const copy = configurationSections.skills;
  return (
    <ConfigurationList title={copy.listTitle} description={copy.description}>
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
        <li className="px-3 py-2.5 text-sm text-muted-foreground">{empty}</li>
      )}
    </ConfigurationList>
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
      {(managedSkills.length > 0 || available) && (
        <BuiltInGroup
          title="Substrate skills"
          description="Substrate adds these and keeps them up to date. Reset restores them if they were edited on this desktop."
          count={managedSkills.length}
          noun="skill"
          actions={
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
          }
        >
          <StartupSkills skills={managedSkills} />
        </BuiltInGroup>
      )}
    </ConfigurationPage>
  );
}
