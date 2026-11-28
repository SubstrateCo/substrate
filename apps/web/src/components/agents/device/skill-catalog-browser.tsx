import type { CatalogSkill } from "@substrate/contracts/agents/skill-catalog";
import {
  skillRepositorySchema,
  type SkillSourcePreview,
} from "@substrate/contracts/harness-runtime";

import { useState } from "react";

import { ConfigurationList } from "./configuration-page";
import { ContentNotice } from "@/components/feedback/content-notice";
import { PendingButton } from "@/components/feedback/pending-button";
import { GroupTitle } from "@/components/layout/settings-section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item";
import { TextLink } from "@/components/ui/text-link";
import { Check, Search, ArrowLeft, ArrowRight, Link2 } from "lucide-react";

export function SkillCatalogBrowser({
  query,
  onQuery,
  results,
  searching,
  searchError,
  selected,
  onSelect,
  onBack,
  preview,
  previewPending,
  previewError,
  onInstall,
  installing,
  installed,
  available,
}: {
  query: string;
  onQuery: (value: string) => void;
  results: CatalogSkill[];
  searching: boolean;
  searchError: string | null;
  selected: { source: string; name?: string } | null;
  onSelect: (value: { source: string; name?: string }) => void;
  onBack: () => void;
  preview?: SkillSourcePreview;
  previewPending: boolean;
  previewError: string | null;
  onInstall: (source: string, name: string) => void;
  installing: string | null;
  installed: string[];
  available: boolean;
}) {
  const [repository, setRepository] = useState("");
  const [invalid, setInvalid] = useState(false);
  if (selected)
    return (
      <div className="grid min-w-0 gap-6">
        <div className="grid gap-3">
          <Button variant="ghost" size="sm" className="justify-self-start" onClick={onBack}>
            <ArrowLeft /> Back to search
          </Button>
          <GroupTitle
            title={selected.name ?? "Repository skills"}
            description={
              <TextLink href={`https://github.com/${selected.source}`}>{selected.source}</TextLink>
            }
          />
        </div>
        {!available && (
          <ContentNotice
            variant="inline"
            title="Open this agent on its home desktop to preview and add skills."
          />
        )}
        {available && previewPending && (
          <ContentNotice variant="inline" title="Reading skills from GitHub…" />
        )}
        {previewError && <ContentNotice variant="inline" tone="error" title={previewError} />}
        {preview && (
          <ConfigurationList label="Skills from this repository">
            {preview.skills
              .filter((skill) => !selected.name || skill.name === selected.name)
              .map((skill) => {
                const added = installed.includes(skill.name);
                return (
                  <li key={skill.name}>
                    <Item>
                      <ItemContent className="min-w-0">
                        <ItemTitle className="wrap-anywhere">{skill.name}</ItemTitle>
                        <p className="text-sm text-muted-foreground">{skill.description}</p>
                      </ItemContent>
                      <ItemActions>
                        <PendingButton
                          size="sm"
                          pending={installing === skill.name}
                          disabled={!!installing || added || !available}
                          onClick={() => onInstall(selected.source, skill.name)}
                        >
                          {added ? <Check /> : undefined}
                          {added ? "Added" : "Add skill"}
                        </PendingButton>
                      </ItemActions>
                    </Item>
                  </li>
                );
              })}
            {!preview.skills.some((skill) => !selected.name || skill.name === selected.name) && (
              <li className="px-3 py-4 text-sm text-muted-foreground">
                No matching skills in this repository.
              </li>
            )}
          </ConfigurationList>
        )}
        <p className="text-xs text-muted-foreground">
          Community skills can contain instructions and scripts. Review the source before adding.
          Adding a skill does not grant new permissions.
        </p>
      </div>
    );
  return (
    <div className="grid min-w-0 gap-6">
      <div className="grid gap-3">
        <GroupTitle
          title="Find a skill"
          description="Give this agent a new way to help. Search the skills.sh catalog."
        />
        <Input
          type="search"
          aria-label="Search skill catalog"
          placeholder="Try design, testing, or writing…"
          value={query}
          maxLength={120}
          onChange={(event) => onQuery(event.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          Search terms are sent to skills.sh. Telemetry is off.
        </p>
      </div>
      {searchError && (
        <ContentNotice
          variant="compact"
          icon={Search}
          title="Search is unavailable"
          description={searchError}
        />
      )}
      {!searchError && searching && <ContentNotice variant="inline" title="Searching skills…" />}
      {!searchError && !searching && query.trim().length < 2 && (
        <ContentNotice
          variant="compact"
          icon={Search}
          title="What would you like your agent to do?"
          description="Enter at least two characters to find community skills."
        />
      )}
      {!searchError && !searching && query.trim().length >= 2 && results.length === 0 && (
        <ContentNotice
          variant="compact"
          icon={Search}
          title="No skills found"
          description="Try a different search, or import a repository below."
        />
      )}
      {!searchError && !searching && results.length > 0 && (
        <ConfigurationList label="Skill search results">
          {results.map((skill) => (
            <li key={`${skill.source}/${skill.name}`}>
              <Item>
                <ItemContent className="min-w-0">
                  <ItemTitle className="wrap-anywhere">{skill.name}</ItemTitle>
                  <ItemDescription className="wrap-anywhere">{skill.source}</ItemDescription>
                  <p className="text-xs text-muted-foreground">
                    {skill.installs.toLocaleString()} installs
                  </p>
                </ItemContent>
                <ItemActions>
                  <Button variant="outline" size="sm" onClick={() => onSelect(skill)}>
                    View <ArrowRight />
                  </Button>
                </ItemActions>
              </Item>
            </li>
          ))}
        </ConfigurationList>
      )}
      <div className="grid gap-3 border-t pt-6">
        <GroupTitle
          title="Have a repository?"
          description="Import skills directly from a public GitHub repository."
        />
        <form
          className="flex flex-wrap items-start gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const parsed = skillRepositorySchema.safeParse(repository);
            setInvalid(!parsed.success);
            if (parsed.success) onSelect({ source: parsed.data });
          }}
        >
          <div className="min-w-0 flex-1 basis-48">
            <Input
              aria-label="GitHub repository"
              placeholder="owner/repository"
              value={repository}
              aria-invalid={invalid}
              onChange={(event) => {
                setRepository(event.target.value);
                setInvalid(false);
              }}
            />
            {invalid && (
              <p role="alert" className="mt-2 text-sm text-destructive">
                Use owner/repository, without a URL.
              </p>
            )}
          </div>
          <Button type="submit" variant="outline">
            <Link2 /> Import
          </Button>
        </form>
      </div>
    </div>
  );
}
