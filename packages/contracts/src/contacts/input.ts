import { organizationId, recordListFields } from "../workspace.ts";
import { z } from "zod";

export const contactsWorkspace = z.object({ organizationId });
export const contactsRecord = contactsWorkspace.extend({ entityId: z.uuid() });
export const contactsList = contactsWorkspace.extend(recordListFields);
export const contactReference = contactsWorkspace.extend({ contactEntityId: z.uuid() });
export const contactIdentifierSearch = contactsWorkspace.extend({
  type: z.enum(["email", "phone"]),
  value: z.string().trim().min(1).max(1000),
  countryCode: z.string().length(2).optional(),
});
export const contactFields = z.object({
  displayName: z.string().trim().min(1).max(1000),
  givenName: z.string().trim().min(1).max(1000).nullable().optional(),
  familyName: z.string().trim().min(1).max(1000).nullable().optional(),
  notes: z.string().max(50000).nullable().optional(),
});
const detailFields = {
  label: z.string().trim().min(1).max(1000).nullable().optional(),
  isPrimary: z.boolean().optional(),
};
export const contactIdentifierFields = z.object({
  ...detailFields,
  type: z.enum(["email", "phone"]),
  value: z.string().trim().min(1).max(1000),
  extension: z
    .string()
    .regex(/^[0-9]+$/)
    .max(20)
    .nullable()
    .optional(),
  countryCode: z.string().length(2).optional(),
});
export type ContactIdentifierType = z.output<typeof contactIdentifierFields>["type"];
const addressText = z.string().trim().min(1).max(1000).nullable().optional();
export const contactAddressFields = z.object({
  ...detailFields,
  streetAddress: addressText,
  extendedAddress: addressText,
  city: addressText,
  region: addressText,
  postalCode: addressText,
  countryCode: z
    .string()
    .regex(/^[A-Z]{2}$/)
    .nullable()
    .optional(),
  formattedAddress: addressText,
});
export const contactUrlFields = z.object({
  ...detailFields,
  url: z.url({ protocol: /^https?$/ }).max(4000),
});
export const contactWrite = z.discriminatedUnion("action", [
  contactsWorkspace.extend({ action: z.literal("createContact"), ...contactFields.shape }),
  contactsRecord.extend({ action: z.literal("updateContact"), ...contactFields.partial().shape }),
  contactReference.extend({ action: z.literal("addIdentifier"), ...contactIdentifierFields.shape }),
  contactReference.extend({
    action: z.literal("updateIdentifier"),
    id: z.uuid(),
    ...contactIdentifierFields.shape,
  }),
  contactReference.extend({ action: z.literal("removeIdentifier"), id: z.uuid() }),
  contactReference.extend({ action: z.literal("addAddress"), ...contactAddressFields.shape }),
  contactReference.extend({
    action: z.literal("updateAddress"),
    id: z.uuid(),
    ...contactAddressFields.shape,
  }),
  contactReference.extend({ action: z.literal("removeAddress"), id: z.uuid() }),
  contactReference.extend({ action: z.literal("addUrl"), ...contactUrlFields.shape }),
  contactReference.extend({
    action: z.literal("updateUrl"),
    id: z.uuid(),
    ...contactUrlFields.shape,
  }),
  contactReference.extend({ action: z.literal("removeUrl"), id: z.uuid() }),
  contactsRecord.extend({ action: z.literal("archive"), archived: z.boolean() }),
]);
export type ContactWrite = z.output<typeof contactWrite>;
