import {
  matchPeople,
  type PickedRecipient,
  type PickerAgent,
  type PickerPerson,
} from "@substrate/contracts/people/picker";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { flushSync } from "react-dom";

import { ActorAvatar, ActorKindSuffix } from "@/components/people/actor-avatar";
import { FieldDescription, FieldError } from "@/components/ui/field";
import { Pressable } from "@/components/ui/pressable";
import { actorLabel, type ActorIdentity } from "@/lib/actors/identity";
import {
  addTypedRecipients,
  isEmailAddress,
  limitMessage,
  recipientActor,
  recipientFor,
  recipientKey,
} from "@/lib/people/people-picker";
import { Mail, X } from "lucide-react";

const separators = new Set([",", ";", " "]);

function suggestionsFor(
  query: string,
  people: readonly PickerPerson[],
  agents: readonly PickerAgent[],
  selected: readonly PickedRecipient[],
  allowEmail: boolean,
): PickedRecipient[] {
  const options: PickedRecipient[] = matchPeople(people, query, selected).map((person) => ({
    email: person.email.toLowerCase(),
    person,
  }));
  options.push(
    ...agents.flatMap((agent) =>
      agent.name.toLowerCase().includes(query.trim().toLowerCase()) &&
      !selected.some((entry) => entry.agent?.id === agent.id)
        ? [{ agent }]
        : [],
    ),
  );
  options.sort((a, b) =>
    (a.agent?.name ?? a.person?.name ?? "").localeCompare(b.agent?.name ?? b.person?.name ?? ""),
  );
  const typed = recipientFor(query, people, allowEmail);
  if (typed && !typed.person && !selected.some((entry) => entry.email === typed.email)) {
    return [...options, typed];
  }
  return options;
}

function pickerInputState({
  selectedCount,
  optionCount,
  query,
  open,
  overflowing,
  disabled,
  invalid,
  describedBy,
  max,
  limitText,
  noticeId,
}: {
  selectedCount: number;
  optionCount: number;
  query: string;
  open: boolean;
  overflowing: boolean;
  disabled: boolean;
  invalid: boolean;
  describedBy?: string;
  max?: number;
  limitText?: string;
  noticeId: string;
}) {
  const full = max !== undefined && selectedCount >= max;
  const notice = overflowing && !invalid ? (limitText ?? limitMessage(max ?? 1)) : undefined;
  const expanded = open && !full && !disabled && (optionCount > 0 || !!query.trim());
  return {
    full,
    notice,
    expanded,
    showInput: !full || query !== "",
    showOptions: expanded && optionCount > 0,
    description:
      [describedBy, notice ? noticeId : undefined].filter(Boolean).join(" ") || undefined,
  };
}

export function PeoplePicker({
  id,
  people,
  agents = [],
  value,
  onValueChange,
  onPendingTextChange,
  allowEmail = true,
  max,
  limitText,
  placeholder,
  disabled = false,
  invalid = false,
  describedBy,
  onBlur,
}: {
  id: string;
  people: readonly PickerPerson[];
  agents?: readonly PickerAgent[];
  value: readonly PickedRecipient[];
  onValueChange: (value: PickedRecipient[]) => void;
  onPendingTextChange?: (text: string) => void;
  allowEmail?: boolean;
  max?: number;
  limitText?: string;
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
  onBlur?: () => void;
}) {
  const listId = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [overflowing, setOverflowing] = useState(false);
  const anchor = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const focusAfterChange = useRef<"input" | "chip">(undefined);
  const noticeId = `${listId}-limit`;
  const options = suggestionsFor(query, people, agents, value, allowEmail);
  const { full, notice, expanded, showInput, showOptions, description } = pickerInputState({
    selectedCount: value.length,
    optionCount: options.length,
    query,
    open,
    overflowing,
    disabled,
    invalid,
    describedBy,
    max,
    limitText,
    noticeId,
  });
  const activeIndex = Math.min(active, options.length - 1);
  const optionId = (index: number) => `${listId}-${index}`;

  const setText = (text: string) => {
    setQuery(text);
    setOverflowing(false);
    onPendingTextChange?.(text);
  };
  const choose = (recipient: PickedRecipient, keepOpen: boolean) => {
    if (max !== undefined && value.length + 1 >= max) focusAfterChange.current = "chip";
    onValueChange([...value, recipient]);
    setText("");
    setActive(0);
    setOpen(keepOpen);
  };
  const addTyped = (text: string, refocus = false) => {
    const result = addTypedRecipients(value, text, people, { allowEmail, max });
    if (result.value.length !== value.length) {
      if (refocus && max !== undefined && result.value.length >= max) {
        focusAfterChange.current = result.rest ? "input" : "chip";
      }
      onValueChange(result.value);
    }
    setText(result.rest);
    setOverflowing(result.overflow);
    setOpen(false);
  };
  const remove = (key: string) => {
    focusAfterChange.current = "input";
    onValueChange(value.filter((entry) => recipientKey(entry) !== key));
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;
    const move = { ArrowDown: 1, ArrowUp: -1 }[event.key];
    if (move && options.length && !full) {
      event.preventDefault();
      let next = (activeIndex + move + options.length) % options.length;
      if (!showOptions) next = move > 0 ? 0 : options.length - 1;
      flushSync(() => {
        setOpen(true);
        setActive(next);
      });
      list.current?.children[next]?.scrollIntoView({ block: "nearest" });
    } else if (event.key === "Enter" && showOptions && options[activeIndex]) {
      event.preventDefault();
      choose(options[activeIndex], event.shiftKey);
    } else if (event.key === "Enter" && query.trim()) {
      event.preventDefault();
    } else if (event.key === "Backspace" && !query && value.length) {
      event.preventDefault();
      onValueChange(value.slice(0, -1));
    } else if (separators.has(event.key) && isEmailAddress(query)) {
      event.preventDefault();
      addTyped(query, true);
    }
  };

  useEffect(() => {
    const target = focusAfterChange.current;
    focusAfterChange.current = undefined;
    if (target === "input") input.current?.focus();
    else if (target === "chip")
      anchor.current?.querySelector<HTMLElement>("button:last-of-type")?.focus();
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- Move focus after the chips change, once the input has mounted or unmounted.
  }, [value.length]);

  // Escape closes the suggestions first. The dialog around the field listens at the document, so
  // this must run earlier, on the window.
  useEffect(() => {
    if (!expanded) return;
    const closeSuggestions = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape" || document.activeElement !== input.current) return;
      event.stopPropagation();
      setOpen(false);
    };
    window.addEventListener("keydown", closeSuggestions, true);
    return () => window.removeEventListener("keydown", closeSuggestions, true);
  }, [expanded]);

  return (
    <div className="grid min-w-0 gap-1">
      <div
        ref={anchor}
        data-slot="people-picker"
        data-disabled={disabled || undefined}
        aria-invalid={invalid || undefined}
        className="flex min-h-8 w-full flex-wrap items-center gap-1 rounded-lg border border-input bg-transparent px-1 py-0.5 transition duration-150 ease-out focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 aria-invalid:border-destructive focus-within:aria-invalid:ring-destructive/20 dark:bg-input/30 dark:aria-invalid:border-destructive data-disabled:pointer-events-none data-disabled:opacity-50"
        onPointerDown={(event) => {
          if (event.target === event.currentTarget) {
            event.preventDefault();
            input.current?.focus();
          }
        }}
      >
        {value.map((recipient) => (
          <RecipientChip
            key={recipientKey(recipient)}
            recipient={recipient}
            disabled={disabled}
            onRemove={() => remove(recipientKey(recipient))}
          />
        ))}
        {showInput && (
          // oxlint-disable-next-line design/no-native-element -- The typing area of a token field: the people-picker container draws the field border and focus ring, so the Input chrome would double them.
          <input
            ref={input}
            id={id}
            type="text"
            role="combobox"
            value={query}
            disabled={disabled}
            placeholder={value.length ? undefined : placeholder}
            autoComplete="off"
            spellCheck={false}
            aria-autocomplete="list"
            aria-expanded={expanded}
            aria-controls={showOptions ? listId : undefined}
            aria-activedescendant={showOptions ? optionId(activeIndex) : undefined}
            aria-invalid={invalid || undefined}
            aria-describedby={description}
            className="h-6 min-w-0 flex-1 basis-32 bg-transparent px-1.5 text-base outline-none placeholder:text-muted-foreground md:text-sm"
            onChange={(event) => {
              setText(event.target.value);
              setActive(0);
              setOpen(event.target.value.trim() !== "");
            }}
            onBlur={() => {
              setOpen(false);
              if (query.trim()) addTyped(query);
              onBlur?.();
            }}
            onKeyDown={onKeyDown}
            onPaste={(event) => {
              const text = event.clipboardData.getData("text");
              if (!/[,;\s]/.test(text.trim())) return;
              event.preventDefault();
              addTyped(`${query} ${text}`, true);
            }}
          />
        )}
      </div>
      {notice && <FieldError id={noticeId}>{notice}</FieldError>}
      {expanded && (
        <PeopleSuggestions
          list={list}
          listId={listId}
          options={options}
          optionId={optionId}
          allowEmail={allowEmail}
          activeIndex={activeIndex}
          onHover={setActive}
          onChoose={choose}
        />
      )}
    </div>
  );
}

function PeopleSuggestions({
  list,
  listId,
  options,
  optionId,
  allowEmail,
  activeIndex,
  onHover,
  onChoose,
}: {
  list: RefObject<HTMLDivElement | null>;
  listId: string;
  options: PickedRecipient[];
  optionId: (index: number) => string;
  allowEmail: boolean;
  activeIndex: number;
  onHover: (index: number) => void;
  onChoose: (option: PickedRecipient, keepOpen: boolean) => void;
}) {
  if (!options.length)
    return (
      <FieldDescription role="status">
        {allowEmail
          ? "No one here matches. Type a full email address to invite someone."
          : "No one here matches."}
      </FieldDescription>
    );
  return (
    <div
      ref={list}
      id={listId}
      role="listbox"
      aria-label="Suggested people"
      className="grid max-h-56 gap-0.5 overflow-y-auto rounded-lg border bg-popover p-1"
      onMouseDown={(event) => event.preventDefault()}
    >
      {options.map((option, index) => {
        const actor = recipientActor(option);
        return (
          <Option
            key={recipientKey(option)}
            id={optionId(index)}
            label={actor?.kind === "agent" ? actorLabel(actor) : undefined}
            active={index === activeIndex}
            onHover={() => onHover(index)}
            onChoose={(keepOpen) => onChoose(option, keepOpen)}
          >
            <RecipientOption recipient={option} actor={actor} />
          </Option>
        );
      })}
    </div>
  );
}

function RecipientOption({
  recipient,
  actor,
}: {
  recipient: PickedRecipient;
  actor: ActorIdentity | null;
}) {
  if (actor)
    return (
      <>
        <ActorAvatar actor={actor} />
        <span className="truncate font-medium">{actor.name}</span>
        {recipient.person && (
          <span className="min-w-0 truncate text-muted-foreground">{recipient.email}</span>
        )}
      </>
    );
  return (
    <>
      <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        <Mail aria-hidden="true" className="size-3.5" />
      </span>
      <span className="truncate">
        Invite <span className="font-medium">{recipient.email}</span>
      </span>
    </>
  );
}

function Option({
  id,
  label,
  active,
  onHover,
  onChoose,
  children,
}: {
  id: string;
  label?: string;
  active: boolean;
  onHover: () => void;
  onChoose: (keepOpen: boolean) => void;
  children: ReactNode;
}) {
  return (
    <div
      id={id}
      role="option"
      aria-label={label}
      aria-selected={active}
      className="flex h-9 min-w-0 cursor-default items-center gap-2 rounded-md px-2 text-sm select-none aria-selected:bg-row-hover"
      onPointerMove={onHover}
      onClick={(event) => onChoose(event.shiftKey)}
    >
      {children}
    </div>
  );
}

function RecipientChip({
  recipient,
  disabled,
  onRemove,
}: {
  recipient: PickedRecipient;
  disabled: boolean;
  onRemove: () => void;
}) {
  const actor = recipientActor(recipient);
  const label = actor?.name ?? recipient.email;
  return (
    <span
      title={
        actor?.kind === "agent" ? "Agent" : (recipient.person?.email ?? "Gets an email invitation")
      }
      className="inline-flex h-6 max-w-full min-w-0 items-center gap-1.5 rounded-md bg-muted pr-0.5 pl-0.5 text-sm"
    >
      {actor ? (
        <ActorAvatar actor={actor} size="xs" />
      ) : (
        <Mail aria-hidden="true" className="ml-1 size-3.5 shrink-0 text-muted-foreground" />
      )}
      <span className="truncate">
        {label}
        <ActorKindSuffix actor={actor} />
      </span>
      <Pressable
        disabled={disabled}
        aria-label={`Remove ${label}`}
        className="flex size-5 shrink-0 items-center justify-center text-muted-foreground hover:bg-row-highlight hover:text-foreground"
        onClick={onRemove}
      >
        <X aria-hidden="true" className="size-3" />
      </Pressable>
    </span>
  );
}
