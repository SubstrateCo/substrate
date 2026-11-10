import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

import { PersonAvatar } from "@/components/people/person-avatar";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
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
 * Label it with a `FieldLabel htmlFor={id}`. It owns no validation; pass `invalid` and
 * `describedBy` from the form.
 */
export function PeoplePicker({
  id,
  people,
  value,
  onValueChange,
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
  const showList = open && !full && !disabled && (options.length > 0 || !!query.trim());
  const activeIndex = Math.min(active, options.length - 1);
  const optionId = (index: number) => `${listId}-${index}`;

  const choose = (recipient: PickedRecipient) => {
    onValueChange([...value, recipient]);
    setQuery("");
    setActive(0);
  };
  const addTyped = (text: string) => {
    const result = addTypedRecipients(value, text, people, { allowEmail, max });
    if (result.value.length !== value.length) onValueChange(result.value);
    setQuery(result.rest);
  };
  const remove = (email: string) => {
    onValueChange(value.filter((entry) => entry.email !== email));
    input.current?.focus();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;
    const move = { ArrowDown: 1, ArrowUp: -1 }[event.key];
    if (move && options.length) {
      event.preventDefault();
      setOpen(true);
      setActive((activeIndex + move + options.length) % options.length);
    } else if (event.key === "Enter" && showList && options[activeIndex]) {
      event.preventDefault();
      choose(options[activeIndex]);
    } else if (event.key === "Enter" && query.trim()) {
      // Unfinished text never submits the form.
      event.preventDefault();
    } else if (event.key === "Backspace" && !query && value.length) {
      event.preventDefault();
      onValueChange(value.slice(0, -1));
    } else if (separators.has(event.key) && isEmailAddress(query)) {
      event.preventDefault();
      addTyped(query);
    }
  };

  return (
    <Popover open={showList} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
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
              aria-expanded={showList}
              aria-controls={showList ? listId : undefined}
              aria-activedescendant={
                showList && options[activeIndex] ? optionId(activeIndex) : undefined
              }
              aria-invalid={invalid || undefined}
              aria-describedby={describedBy}
              className="h-6 min-w-32 flex-1 bg-transparent px-1.5 text-base outline-none placeholder:text-muted-foreground md:text-sm"
              onChange={(event) => {
                setQuery(event.target.value);
                setActive(0);
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
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
                addTyped(`${query} ${text}`);
              }}
            />
          )}
        </div>
      </PopoverAnchor>
      <PopoverContent
        variant="menu"
        align="start"
        className="w-(--radix-popover-trigger-width) min-w-64"
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
        // Keep focus in the input while choosing with the pointer.
        onPointerDown={(event) => event.preventDefault()}
        onInteractOutside={(event) => {
          // Pressing the field itself keeps the list open.
          const target = event.target;
          if (target instanceof Node && anchor.current?.contains(target)) event.preventDefault();
        }}
      >
        <div
          id={listId}
          role="listbox"
          aria-label="Suggested people"
          className="no-scrollbar grid max-h-64 gap-0.5 overflow-y-auto"
        >
          {options.map((option, index) => (
            <Option
              key={option.email}
              id={optionId(index)}
              active={index === activeIndex}
              onHover={() => setActive(index)}
              onChoose={() => choose(option)}
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
        {!options.length && (
          <p className="px-2 py-1.5 text-sm text-muted-foreground">
            {allowEmail
              ? "No one here matches. Type a full email address to invite someone."
              : "No one here matches."}
          </p>
        )}
      </PopoverContent>
    </Popover>
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
  onChoose: () => void;
  children: ReactNode;
}) {
  return (
    <div
      id={id}
      role="option"
      aria-selected={active}
      className="flex h-9 min-w-0 cursor-default items-center gap-2 rounded-md px-2 text-sm select-none aria-selected:bg-row-hover"
      onPointerMove={onHover}
      onClick={onChoose}
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
