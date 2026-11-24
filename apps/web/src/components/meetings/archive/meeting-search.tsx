import { useHotkey } from "@tanstack/react-hotkeys";

import { useRef } from "react";
import { createPortal } from "react-dom";

import { ArchiveTitleTools } from "./archive-title-tools";
import { useWorkspaceSearch } from "@/components/context/search/workspace-search-context";
import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Kbd } from "@/components/ui/kbd";
import { SheetTrigger } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Menu, Search, SearchCode, X } from "lucide-react";

export function MeetingSearchField({
  phrase,
  onChange,
}: {
  phrase: string;
  onChange: (phrase: string) => void;
}) {
  const { localSearchTarget, openSearch } = useWorkspaceSearch();
  const input = useRef<HTMLInputElement>(null);
  useHotkey("/", (event) => {
    if (
      event.target instanceof Element &&
      event.target.closest("[role=dialog], [role=alertdialog]")
    )
      return;
    input.current?.focus();
  });
  const search = (
    <div
      data-local-search
      role="search"
      aria-label="Meeting archive"
      className="relative mx-auto flex w-full items-center gap-1.5 text-foreground md:max-w-105"
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="md:hidden"
              aria-label="Open meeting navigation"
            >
              <Menu />
            </Button>
          </SheetTrigger>
        </TooltipTrigger>
        <TooltipContent>Open meeting navigation</TooltipContent>
      </Tooltip>
      <InputGroup variant="titlebar">
        <InputGroupAddon>
          <Search aria-hidden="true" className="size-3.5" />
        </InputGroupAddon>
        <InputGroupInput
          ref={input}
          type="search"
          aria-label="Search meetings"
          autoComplete="off"
          placeholder="Search meetings, people, or phrases"
          maxLength={256}
          className="[&::-webkit-search-cancel-button]:hidden"
          value={phrase}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape" && phrase) {
              e.preventDefault();
              e.stopPropagation();
              onChange("");
            }
          }}
        />
        <InputGroupAddon align="inline-end">
          {phrase ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <InputGroupButton
                  size="icon-xs"
                  aria-label="Clear search"
                  onClick={() => {
                    onChange("");
                    input.current?.focus();
                  }}
                >
                  <X />
                </InputGroupButton>
              </TooltipTrigger>
              <TooltipContent>Clear search</TooltipContent>
            </Tooltip>
          ) : (
            <Kbd>/</Kbd>
          )}
        </InputGroupAddon>
      </InputGroup>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            data-open-workspace-search
            size="icon-sm"
            variant="ghost"
            aria-label="Search workspace"
            className="md:absolute md:left-full md:ml-2"
            onClick={() => openSearch("all")}
          >
            <SearchCode />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Search workspace</TooltipContent>
      </Tooltip>
      <ArchiveTitleTools />
    </div>
  );
  return localSearchTarget ? createPortal(search, localSearchTarget) : search;
}
