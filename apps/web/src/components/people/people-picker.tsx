import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

import { PersonAvatar } from "@/components/people/person-avatar";
import {
  addTypedRecipients,
  isEmailAddress,
  matchPeople,
  recipientFor,
  type PickedRecipient,
  type PickerPerson,
} from "@/lib/people/people-picker";
import { Mail, X } from "lucide-react";

const separators = new Set([",", ";", " "]);

/**
 * A token input for choosing people. It suggests `people` by name or email, shows each choice as
 * a removable chip, and, with `allowEmail`, offers "Invite <email>" for an address that matches no
 * one. Typing a separator, pasting a list, or leaving the field adds complete addresses.
 *
 * Suggestions open when the person types or presses ArrowDown, never on focus. They sit under the
 * field, in the flow of the form, so they push the rest of a dialog down instead of covering its
 * consent text or footer. A pick closes them; hold Shift to keep choosing.
 *
 * Label it with a `FieldLabel htmlFor={id}`. It owns no validation; pass `invalid` and
 * `describedBy` from the form, and use `onPendingTextChange` to refuse a submit while unfinished
 * text is left in the field.
 */
export function PeoplePicker({
  id,
  people,
  value,
  onValueChange,
  onPendingTextChange,
  allowEmail = true,
  max,
  placeholder,
  disabled = false,
  invalid = false,
  describedBy,
  onBlur,
}: {
  id: string;
  /** The people to suggest. Leave out the viewer and anyone who cannot be chosen. */
  people: readonly PickerPerson[];
  value: readonly PickedRecipient[];
  onValueChange: (value: PickedRecipient[]) => void;
  /** Called with the text typed into the field that is not a chip yet. */
  onPendingTextChange?: (text: string) => void;
  /** Allow addresses that match none of `people`, such as people to invite. */
  allowEmail?: boolean;
  /** The most people to choose. The input hides when the limit is reached. */
  max?: number;
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
  const anchor = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  // Where focus goes once the chips have changed: the input may not exist until then.
  const focusAfterChange = useRef<"input" | "chip">(undefined);
  const scrollToActive = useRef(false);
  const full = max !== undefined && value.length >= max;
  const typed = recipientFor(query, people, allowEmail);
  const invite =
    typed && !typed.person && !value.some((entry) => entry.email === typed.email)
      ? typed
      : undefined;
  const options: PickedRecipient[] = [
    ...matchPeople(people, query, value).map((person) => ({
      email: person.email.toLowerCase(),
      person,
    })),
    ...(invite ? [invite] : []),
  ];
  const expanded = open && !full && !disabled && (options.length > 0 || !!query.trim());
  const showOptions = expanded && options.length > 0;
  const activeIndex = Math.min(active, options.length - 1);
  const optionId = (index: number) => `${listId}-${index}`;

  const setText = (text: string) => {
    setQuery(text);
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
        focusAfterChange.current = "chip";
      }
      onValueChange(result.value);
    }
    setText(result.rest);
    setOpen(false);
  };
  const remove = (email: string) => {
    focusAfterChange.current = "input";
    onValueChange(value.filter((entry) => entry.email !== email));
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;
    const move = { ArrowDown: 1, ArrowUp: -1 }[event.key];
    if (move && options.length) {
      event.preventDefault();
      scrollToActive.current = true;
      setOpen(true);
      setActive((activeIndex + move + options.length) % options.length);
    } else if (event.key === "Enter" && showOptions && options[activeIndex]) {
      event.preventDefault();
      choose(options[activeIndex], event.shiftKey);
    } else if (event.key === "Enter" && query.trim()) {
      // Unfinished text never submits the form.
      event.preventDefault();
    } else if (event.key === "Backspace" && !query && value.length) {
      event.preventDefault();
      onValueChange(value.slice(0, -1));
    } else if (separators.has(event.key) && isEmailAddress(query)) {
      event.preventDefault();
      addTyped(query, true);
    }
  };

  // Runs after the chips changed, when the input has mounted or unmounted.
  useEffect(() => {
    const target = focusAfterChange.current;
    focusAfterChange.current = undefined;
    if (target === "input") input.current?.focus();
    else if (target === "chip")
      anchor.current?.querySelector<HTMLElement>("button:last-of-type")?.focus();
  }, [value.length]);

  // Keep the option chosen with the arrow keys in view, without moving focus from the input.
  useEffect(() => {
    if (!scrollToActive.current) return;
    scrollToActive.current = false;
    list.current?.children[activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, showOptions]);

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
    <div className="grid gap-1">
      <div
        ref={anchor}
        data-slot="people-picker"
        data-disabled={disabled || undefined}
        aria-invalid={invalid || undefined}
        className="flex min-h-8 w-full flex-wrap items-center gap-1 rounded-lg border border-input bg-transparent p-1 transition duration-150 ease-out focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:bg-input/30 dark:aria-invalid:border-destructive/50 data-disabled:pointer-events-none data-disabled:opacity-50"
        onPointerDown={(event) => {
          if (event.target === event.currentTarget) {
            event.preventDefault();
            input.current?.focus();
          }
        }}
      >
        {value.map((recipient) => (
          <RecipientChip
            key={recipient.email}
            recipient={recipient}
            disabled={disabled}
            onRemove={() => remove(recipient.email)}
          />
        ))}
        {!full && (
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
            aria-describedby={describedBy}
            className="h-6 min-w-32 flex-1 bg-transparent px-1.5 text-base outline-none placeholder:text-muted-foreground md:text-sm"
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
      {showOptions && (
        <div
          ref={list}
          id={listId}
          role="listbox"
          aria-label="Suggested people"
          className="grid max-h-56 gap-0.5 overflow-y-auto rounded-lg border bg-popover p-1"
          // Keep focus in the input while choosing with the pointer.
          onMouseDown={(event) => event.preventDefault()}
        >
          {options.map((option, index) => (
            <Option
              key={option.email}
              id={optionId(index)}
              active={index === activeIndex}
              onHover={() => setActive(index)}
              onChoose={(keepOpen) => choose(option, keepOpen)}
            >
              {option.person ? (
                <>
                  <PersonAvatar name={option.person.name} image={option.person.image} />
                  <span className="truncate font-medium">{option.person.name}</span>
                  <span className="min-w-0 truncate text-muted-foreground">{option.email}</span>
                </>
              ) : (
                <>
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                    <Mail aria-hidden="true" className="size-3.5" />
                  </span>
                  <span className="truncate">
                    Invite <span className="font-medium">{option.email}</span>
                  </span>
                </>
              )}
            </Option>
          ))}
        </div>
      )}
      {expanded && !options.length && (
        <p role="status" className="px-1 text-sm text-muted-foreground">
          {allowEmail
            ? "No one here matches. Type a full email address to invite someone."
            : "No one here matches."}
        </p>
      )}
    </div>
  );
}

function Option({
  id,
  active,
  onHover,
  onChoose,
  children,
}: {
  id: string;
  active: boolean;
  onHover: () => void;
  onChoose: (keepOpen: boolean) => void;
  children: ReactNode;
}) {
  return (
    <div
      id={id}
      role="option"
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
  const label = recipient.person?.name ?? recipient.email;
  return (
    <span
      title={recipient.person ? recipient.email : "Gets an email invitation"}
      className="inline-flex h-6 max-w-full min-w-0 items-center gap-1.5 rounded-md bg-muted pr-0.5 pl-0.5 text-sm"
    >
      {recipient.person ? (
        <PersonAvatar name={label} image={recipient.person.image} size="xs" />
      ) : (
        <Mail aria-hidden="true" className="ml-1 size-3.5 shrink-0 text-muted-foreground" />
      )}
      <span className="truncate">{label}</span>
      <button
        type="button"
        disabled={disabled}
        aria-label={`Remove ${label}`}
        className="flex size-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground outline-none hover:bg-foreground/10 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
        onClick={onRemove}
      >
        <X aria-hidden="true" className="size-3" />
      </button>
    </span>
  );
}
