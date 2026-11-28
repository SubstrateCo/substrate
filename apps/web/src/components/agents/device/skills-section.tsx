import { type HarnessSkill } from "@substrate/contracts/harness-runtime";

import { useState, type ReactNode } from "react";

import { CatalogRow } from "../catalog/catalog-row";
import { openingName } from "../editors/skill-name";
import { BuiltInGroup, ConfigurationList, ConfigurationSearch } from "./configuration-page";
import { matchesSearch } from "./configuration-section-copy";
import { StartupSkills } from "./startup-configuration";
import { GroupTitle } from "@/components/layout/settings-section";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, RotateCcw } from "lucide-react";

export type SkillCatalogView = "installed" | "discover" | "updates";

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
  let empty = "No custom skills yet.";
  if (searching) empty = "No skills match.";
  return (
    <ConfigurationList label="Custom skills">
      {skills.length ? (
        skills.map((item) => {
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
  renderCatalog,
}: {
  skills: readonly HarnessSkill[];
  managedSkills: HarnessSkill[];
  scanned: boolean;
  available: boolean;
  fetching: boolean;
  refresh: ReactNode;
  status: ReactNode;
  resetting: boolean;
  removing: boolean;
  onReset: () => void;
  onCreate: () => void;
  onEdit: (id: string) => void;
  onDelete: (skill: { id: string; name: string }) => void;
  renderCatalog: (view: SkillCatalogView, onBrowse: () => void) => ReactNode;
}) {
  const [view, setView] = useState<SkillCatalogView>("installed");
  const [query, setQuery] = useState("");
  const shown = skills.filter((skill) =>
    matchesSearch(query, openingName(skill), skill.description),
  );
  return (
    <Tabs
      value={view}
      onValueChange={(value) => {
        if (value === "installed" || value === "discover" || value === "updates") setView(value);
      }}
    >
      <div className="border-b pb-1">
        <TabsList variant="line" aria-label="Skills views">
          <TabsTrigger value="installed">Installed</TabsTrigger>
          <TabsTrigger value="discover">Browse skills</TabsTrigger>
          <TabsTrigger value="updates">Updates</TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value={view}>
        <div className="grid min-w-0 gap-8 pt-6">
          {view === "installed" && status}
          {renderCatalog(view, () => setView("discover"))}
          {view === "installed" && scanned && (
            <section className="grid min-w-0 gap-4" aria-label="Custom skills">
              <GroupTitle
                title="Custom skills"
                description="Written by you, for this agent."
                actions={
                  <>
                    {refresh}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={!available || fetching}
                      onClick={onCreate}
                    >
                      <Plus /> New skill
                    </Button>
                  </>
                }
              />
              {(skills.length > 5 || !!query.trim()) && (
                <ConfigurationSearch
                  label="custom skills"
                  count={skills.length}
                  value={query}
                  onChange={setQuery}
                />
              )}
              <SkillList
                skills={shown}
                searching={!!query.trim()}
                removing={removing}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            </section>
          )}
          {view === "installed" && (managedSkills.length > 0 || available) && (
            <BuiltInGroup
              title="Substrate skills"
              description="Included with Substrate. Updated with the app."
              count={managedSkills.length}
              noun="skill"
            >
              <div className="grid gap-4">
                <StartupSkills skills={managedSkills} />
                <div className="flex justify-end">
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
                </div>
              </div>
            </BuiltInGroup>
          )}
        </div>
      </TabsContent>
    </Tabs>
  );
}
