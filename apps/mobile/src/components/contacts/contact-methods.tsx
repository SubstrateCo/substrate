import type { ContactIdentifierType } from "@substrate/contracts/contacts/input";

import { useState } from "react";
import { Linking } from "react-native";

import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import {
  addressInput,
  addressLine,
  addressText,
  type AddressText,
} from "@/features/records/contact-address";
import { useContactWrite } from "@/features/records/queries";
import type { ContactDetail } from "@/features/records/requests";
import { SelectField, SwitchField, TextField } from "@/features/records/ui/fields";
import { DetailSection, Row } from "@/features/records/ui/rows";
import {
  ActionSheet,
  ConfirmSheet,
  FormSheet,
  type SheetAction,
} from "@/features/records/ui/sheet";
import type { QueryScope } from "@/queries/keys";
import { Globe, Mail, MapPin, Phone } from "lucide-react-native";

type Identifier = ContactDetail["identifiers"][number];
type Url = ContactDetail["urls"][number];
type Address = ContactDetail["addresses"][number];
type Editor =
  | { type: "identifier"; record?: Identifier }
  | { type: "url"; record?: Url }
  | { type: "address"; record?: Address };
type Removal = {
  action: "removeIdentifier" | "removeUrl" | "removeAddress";
  id: string;
  label: string;
};

/** Emails, phone numbers, websites and addresses. */
export function ContactMethods({
  scope,
  contact,
  editable,
}: {
  scope: QueryScope;
  contact: ContactDetail;
  editable: boolean;
}) {
  const write = useContactWrite(scope);
  const contactEntityId = contact.profile.entityId;
  const [editor, setEditor] = useState<Editor | null>(null);
  const [menu, setMenu] = useState<{ title: string; actions: SheetAction[] } | null>(null);
  const [removing, setRemoving] = useState<Removal | null>(null);
  const [adding, setAdding] = useState(false);
  const count = contact.identifiers.length + contact.urls.length + contact.addresses.length;
  const open = (url: string) => () => void Linking.openURL(url).catch(() => undefined);

  return (
    <DetailSection
      title="Contact details"
      count={count || undefined}
      action={
        editable ? { label: "Add contact detail", onPress: () => setAdding(true) } : undefined
      }
    >
      {count === 0 ? (
        <Text className="px-4 py-3 text-sm text-muted-foreground">
          No email, phone, website or address.
        </Text>
      ) : null}
      {contact.identifiers.map((identifier) => {
        const value = `${identifier.value}${identifier.extension ? ` ext. ${identifier.extension}` : ""}`;
        const href =
          identifier.type === "email" ? `mailto:${identifier.value}` : `tel:${identifier.value}`;
        return (
          <Row
            key={identifier.id}
            title={value}
            subtitle={`${identifier.label || (identifier.type === "email" ? "Email" : "Phone")}${identifier.isPrimary ? " · Primary" : ""}`}
            leading={
              <Icon
                as={identifier.type === "email" ? Mail : Phone}
                className="size-4 text-muted-foreground"
              />
            }
            onPress={() =>
              setMenu({
                title: value,
                actions: [
                  {
                    label: identifier.type === "email" ? "Send email" : "Call",
                    onPress: open(href),
                  },
                  ...(editable
                    ? [
                        {
                          label: "Edit",
                          onPress: () => setEditor({ type: "identifier", record: identifier }),
                        },
                        {
                          label: "Remove",
                          destructive: true,
                          onPress: () =>
                            setRemoving({
                              action: "removeIdentifier",
                              id: identifier.id,
                              label: value,
                            }),
                        },
                      ]
                    : []),
                ],
              })
            }
          />
        );
      })}
      {contact.urls.map((url) => (
        <Row
          key={url.id}
          title={url.url}
          subtitle={`${url.label || "Website"}${url.isPrimary ? " · Primary" : ""}`}
          leading={<Icon as={Globe} className="size-4 text-muted-foreground" />}
          onPress={() =>
            setMenu({
              title: url.url,
              actions: [
                { label: "Open link", onPress: open(url.url) },
                ...(editable
                  ? [
                      { label: "Edit", onPress: () => setEditor({ type: "url", record: url }) },
                      {
                        label: "Remove",
                        destructive: true,
                        onPress: () =>
                          setRemoving({ action: "removeUrl", id: url.id, label: url.url }),
                      },
                    ]
                  : []),
              ],
            })
          }
        />
      ))}
      {contact.addresses.map((address) => (
        <Row
          key={address.id}
          title={addressLine(address)}
          subtitle={`${address.label || "Address"}${address.isPrimary ? " · Primary" : ""}`}
          leading={<Icon as={MapPin} className="size-4 text-muted-foreground" />}
          onPress={
            editable
              ? () =>
                  setMenu({
                    title: addressLine(address),
                    actions: [
                      {
                        label: "Edit",
                        onPress: () => setEditor({ type: "address", record: address }),
                      },
                      {
                        label: "Remove",
                        destructive: true,
                        onPress: () =>
                          setRemoving({
                            action: "removeAddress",
                            id: address.id,
                            label: addressLine(address),
                          }),
                      },
                    ],
                  })
              : undefined
          }
        />
      ))}
      {adding ? (
        <ActionSheet
          title="Add contact detail"
          onClose={() => setAdding(false)}
          actions={[
            { label: "Email or phone", onPress: () => setEditor({ type: "identifier" }) },
            { label: "Website", onPress: () => setEditor({ type: "url" }) },
            { label: "Address", onPress: () => setEditor({ type: "address" }) },
          ]}
        />
      ) : null}
      {menu ? (
        <ActionSheet title={menu.title} actions={menu.actions} onClose={() => setMenu(null)} />
      ) : null}
      {editor?.type === "identifier" ? (
        <IdentifierForm
          record={editor.record}
          pending={write.isPending}
          error={write.error}
          onClose={() => {
            write.reset();
            setEditor(null);
          }}
          onSubmit={(fields) =>
            write.mutate(
              editor.record
                ? { action: "updateIdentifier", contactEntityId, id: editor.record.id, ...fields }
                : { action: "addIdentifier", contactEntityId, ...fields },
              { onSuccess: () => setEditor(null) },
            )
          }
        />
      ) : null}
      {editor?.type === "url" ? (
        <UrlForm
          record={editor.record}
          pending={write.isPending}
          error={write.error}
          onClose={() => {
            write.reset();
            setEditor(null);
          }}
          onSubmit={(fields) =>
            write.mutate(
              editor.record
                ? { action: "updateUrl", contactEntityId, id: editor.record.id, ...fields }
                : { action: "addUrl", contactEntityId, ...fields },
              { onSuccess: () => setEditor(null) },
            )
          }
        />
      ) : null}
      {editor?.type === "address" ? (
        <AddressForm
          record={editor.record}
          pending={write.isPending}
          error={write.error}
          onClose={() => {
            write.reset();
            setEditor(null);
          }}
          onSubmit={(fields) =>
            write.mutate(
              editor.record
                ? { action: "updateAddress", contactEntityId, id: editor.record.id, ...fields }
                : { action: "addAddress", contactEntityId, ...fields },
              { onSuccess: () => setEditor(null) },
            )
          }
        />
      ) : null}
      {removing ? (
        <ConfirmSheet
          title="Remove this detail?"
          description={removing.label}
          confirmLabel="Remove"
          destructive
          pending={write.isPending}
          error={write.error}
          onCancel={() => setRemoving(null)}
          onConfirm={() =>
            write.mutate(
              { action: removing.action, contactEntityId, id: removing.id },
              { onSuccess: () => setRemoving(null) },
            )
          }
        />
      ) : null}
    </DetailSection>
  );
}

function IdentifierForm({
  record,
  pending,
  error,
  onSubmit,
  onClose,
}: {
  record?: Identifier;
  pending: boolean;
  error: Error | null;
  onSubmit: (fields: {
    type: ContactIdentifierType;
    value: string;
    label: string | null;
    isPrimary: boolean;
    extension: string | null;
  }) => void;
  onClose: () => void;
}) {
  const [type, setType] = useState<ContactIdentifierType>(record?.type ?? "email");
  const [value, setValue] = useState(record?.value ?? "");
  const [label, setLabel] = useState(record?.label ?? "");
  const [extension, setExtension] = useState(record?.extension ?? "");
  const [isPrimary, setPrimary] = useState(record?.isPrimary ?? false);
  const dirty =
    type !== (record?.type ?? "email") ||
    value !== (record?.value ?? "") ||
    label !== (record?.label ?? "") ||
    extension !== (record?.extension ?? "") ||
    isPrimary !== (record?.isPrimary ?? false);
  const validExtension = type === "email" || extension === "" || /^[0-9]{1,20}$/.test(extension);
  return (
    <FormSheet
      title={record ? "Edit contact method" : "Add email or phone"}
      dirty={dirty}
      pending={pending}
      canSave={value.trim().length > 0 && validExtension}
      error={error}
      onClose={onClose}
      onSave={() =>
        onSubmit({
          type,
          value: value.trim(),
          label: label.trim() || null,
          isPrimary,
          extension: type === "phone" && extension ? extension : null,
        })
      }
    >
      <SelectField
        label="Type"
        value={type}
        onChange={setType}
        choices={[
          { value: "email", label: "Email" },
          { value: "phone", label: "Phone" },
        ]}
      />
      <TextField
        label={type === "email" ? "Email address" : "Phone number"}
        value={value}
        onChange={setValue}
        keyboardType={type === "email" ? "email-address" : "phone-pad"}
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={1000}
      />
      {type === "phone" ? (
        <TextField
          label="Extension"
          value={extension}
          onChange={setExtension}
          keyboardType="number-pad"
          maxLength={20}
          error={validExtension ? null : "Use digits only."}
        />
      ) : null}
      <TextField
        label="Label"
        value={label}
        onChange={setLabel}
        placeholder="Work, mobile…"
        maxLength={1000}
      />
      <SwitchField label="Primary" checked={isPrimary} onChange={setPrimary} />
    </FormSheet>
  );
}

function UrlForm({
  record,
  pending,
  error,
  onSubmit,
  onClose,
}: {
  record?: Url;
  pending: boolean;
  error: Error | null;
  onSubmit: (fields: { url: string; label: string | null; isPrimary: boolean }) => void;
  onClose: () => void;
}) {
  const [url, setUrl] = useState(record?.url ?? "");
  const [label, setLabel] = useState(record?.label ?? "");
  const [isPrimary, setPrimary] = useState(record?.isPrimary ?? false);
  const valid = /^https?:\/\/\S+$/i.test(url.trim());
  return (
    <FormSheet
      title={record ? "Edit website" : "Add website"}
      dirty={
        url !== (record?.url ?? "") ||
        label !== (record?.label ?? "") ||
        isPrimary !== (record?.isPrimary ?? false)
      }
      pending={pending}
      canSave={valid}
      error={error}
      onClose={onClose}
      onSave={() => onSubmit({ url: url.trim(), label: label.trim() || null, isPrimary })}
    >
      <TextField
        label="URL"
        value={url}
        onChange={setUrl}
        placeholder="https://example.com"
        keyboardType="url"
        autoCapitalize="none"
        autoCorrect={false}
        error={url && !valid ? "Start with http:// or https://." : null}
      />
      <TextField label="Label" value={label} onChange={setLabel} placeholder="LinkedIn, website…" />
      <SwitchField label="Primary" checked={isPrimary} onChange={setPrimary} />
    </FormSheet>
  );
}

function AddressForm({
  record,
  pending,
  error,
  onSubmit,
  onClose,
}: {
  record?: Address;
  pending: boolean;
  error: Error | null;
  onSubmit: (fields: NonNullable<ReturnType<typeof addressInput>> & { isPrimary: boolean }) => void;
  onClose: () => void;
}) {
  const [initial] = useState(() => (record ? addressText(record) : emptyAddress));
  const [fields, setFields] = useState(initial);
  const [isPrimary, setPrimary] = useState(record?.isPrimary ?? false);
  const set = (key: keyof AddressText) => (value: string) =>
    setFields((current) => ({ ...current, [key]: value }));
  const input = addressInput(fields);
  const country = fields.countryCode.trim();
  const validCountry = country === "" || /^[A-Za-z]{2}$/.test(country);
  const dirty =
    JSON.stringify(fields) !== JSON.stringify(initial) ||
    isPrimary !== (record?.isPrimary ?? false);
  return (
    <FormSheet
      title={record ? "Edit address" : "Add address"}
      dirty={dirty}
      pending={pending}
      canSave={!!input}
      error={error}
      onClose={onClose}
      onSave={() => {
        if (input) onSubmit({ ...input, isPrimary });
      }}
    >
      <TextField label="Street" value={fields.streetAddress} onChange={set("streetAddress")} />
      <TextField
        label="Street line 2"
        value={fields.extendedAddress}
        onChange={set("extendedAddress")}
      />
      <TextField label="City" value={fields.city} onChange={set("city")} />
      <TextField label="Region" value={fields.region} onChange={set("region")} />
      <TextField label="Postal code" value={fields.postalCode} onChange={set("postalCode")} />
      <TextField
        label="Country code"
        value={fields.countryCode}
        onChange={set("countryCode")}
        autoCapitalize="characters"
        maxLength={2}
        placeholder="US"
        error={validCountry ? null : "Use a two-letter country code."}
      />
      <TextField
        label="Full address as written"
        value={fields.formattedAddress}
        onChange={set("formattedAddress")}
        multiline
        description="Optional. Shown instead of the fields above when set."
      />
      <TextField
        label="Label"
        value={fields.label}
        onChange={set("label")}
        placeholder="Office, home…"
      />
      <SwitchField label="Primary" checked={isPrimary} onChange={setPrimary} />
    </FormSheet>
  );
}

const emptyAddress: AddressText = {
  label: "",
  streetAddress: "",
  extendedAddress: "",
  city: "",
  region: "",
  postalCode: "",
  countryCode: "",
  formattedAddress: "",
};
