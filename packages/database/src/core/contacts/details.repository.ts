import type { ContactIdentifierType } from "@substrate/contracts/contacts/input";

import { AccessDeniedError, ConflictError, violatedConstraint } from "../../errors";
import {
  RepositoryContext,
  entityCursor,
  pageSize,
  type AuthorizedAccess,
} from "../repository-context";
import { contactReadable, requireContact } from "./access";
import { contactAddresses, contactUrls } from "./details.schema";
import {
  addressInput,
  normalizedIdentifier,
  parseInput,
  urlInput,
  type AddressInput,
  type IdentifierInput,
  type UrlInput,
} from "./inputs";
import { contactDetailRows, readContactProfile } from "./profile";
import { contactIdentifiers, contacts } from "./schema";
import { and, asc, eq, ne, sql } from "drizzle-orm";

// A unique index allows one primary value. A change that races another primary change loses here.
function primaryChanged(error: Error): never {
  if (violatedConstraint(error)?.endsWith("_primary_unique"))
    throw new ConflictError("This contact changed. Try again.");
  throw error;
}

function duplicateIdentifier(error: Error): never {
  if (violatedConstraint(error) === "contact_identifiers_value_unique")
    throw new ConflictError("This contact already has that email or phone.");
  return primaryChanged(error);
}

function duplicateUrl(error: Error): never {
  if (violatedConstraint(error) === "contact_urls_value_unique")
    throw new ConflictError("This contact already has that URL.");
  return primaryChanged(error);
}

/** `checked` is the caller's requireContact in this transaction; edits to that contact reuse it
 * instead of checking again. */
export function contactDetailsRepository(
  context: RepositoryContext,
  checked?: AuthorizedAccess<"edit">,
) {
  const { db, scope } = context;
  const target = (
    table: typeof contactIdentifiers | typeof contactAddresses | typeof contactUrls,
    contactId: string,
    id?: string,
  ) =>
    and(
      eq(table.organizationId, scope.organizationId),
      eq(table.contactEntityId, contactId),
      id !== undefined ? eq(table.id, id) : undefined,
    );

  async function edit<T>(contactId: string, work: (ctx: RepositoryContext) => Promise<T>) {
    return context.transaction(async (ctx) => {
      if (checked?.entity.entityId !== contactId) await requireContact(ctx, contactId);
      const [contact] = await ctx.db
        .select()
        .from(contacts)
        .where(
          and(eq(contacts.organizationId, scope.organizationId), eq(contacts.entityId, contactId)),
        );
      if (!contact) throw new AccessDeniedError();
      const result = await work(ctx);
      await ctx.touch(contactId);
      return result;
    });
  }

  /** Clears the other primary values. `keepId` is the row the caller makes primary next, so it is
   * written once, not cleared and then set again. */
  async function clearPrimary(
    ctx: RepositoryContext,
    table: typeof contactIdentifiers | typeof contactAddresses | typeof contactUrls,
    contactId: string,
    keepId?: string,
    type?: ContactIdentifierType,
  ) {
    await ctx.db
      .update(table)
      .set({ isPrimary: false, updatedAt: new Date() })
      .where(
        and(
          target(table, contactId),
          eq(table.isPrimary, true),
          keepId !== undefined ? ne(table.id, keepId) : undefined,
          type ? eq(contactIdentifiers.type, type) : undefined,
        ),
      );
  }

  return {
    async getDetail(contactId: string) {
      const profile = await readContactProfile(context, contactId);
      const rows = contactDetailRows(context, contactId);
      const [identifiers, addresses, urls] = await Promise.all([
        rows.identifiers(),
        rows.addresses(),
        rows.urls(),
      ]);
      return { profile, identifiers, addresses, urls };
    },

    async findByIdentifier(
      input: IdentifierInput,
      options: { limit?: number; afterEntityId?: string } = {},
    ) {
      await context.requireActiveActor();
      const afterEntityId = entityCursor(options.afterEntityId);
      const value = normalizedIdentifier(input);
      return db
        .selectDistinct({
          entityId: contacts.entityId,
          organizationId: contacts.organizationId,
          displayName: contacts.displayName,
        })
        .from(contacts)
        .innerJoin(
          contactIdentifiers,
          and(
            eq(contactIdentifiers.organizationId, contacts.organizationId),
            eq(contactIdentifiers.contactEntityId, contacts.entityId),
          ),
        )
        .where(
          and(
            eq(contacts.organizationId, scope.organizationId),
            contactReadable(context, contacts.entityId),
            eq(contactIdentifiers.type, value.type),
            value.normalizedValue
              ? eq(contactIdentifiers.normalizedValue, value.normalizedValue)
              : eq(contactIdentifiers.value, value.value),
            sql`coalesce(${contactIdentifiers.extension}, '') = ${value.extension ?? ""}`,
            afterEntityId ? sql`${contacts.entityId} > ${afterEntityId}::uuid` : undefined,
          ),
        )
        .orderBy(asc(contacts.entityId))
        .limit(pageSize(options.limit));
    },

    async addIdentifier(contactId: string, input: IdentifierInput) {
      const value = normalizedIdentifier(input);
      return edit(contactId, async (ctx) => {
        if (value.isPrimary)
          await clearPrimary(ctx, contactIdentifiers, contactId, undefined, value.type);
        const [row] = await ctx.db
          .insert(contactIdentifiers)
          .values({ ...value, organizationId: scope.organizationId, contactEntityId: contactId })
          .returning()
          .catch(duplicateIdentifier);
        return row!;
      });
    },
    async updateIdentifier(contactId: string, id: string, input: IdentifierInput) {
      const value = normalizedIdentifier(input);
      return edit(contactId, async (ctx) => {
        const [existing] = await ctx.db
          .select()
          .from(contactIdentifiers)
          .where(target(contactIdentifiers, contactId, id));
        if (!existing) throw new AccessDeniedError();
        const isPrimary = value.isPrimary ?? existing.isPrimary;
        // The unique index allows one primary per type, so an unchanged primary has no competitor.
        if (isPrimary && !(existing.isPrimary && existing.type === value.type))
          await clearPrimary(ctx, contactIdentifiers, contactId, id, value.type);
        const [row] = await ctx.db
          .update(contactIdentifiers)
          .set({
            ...value,
            extension: value.extension ?? null,
            label: value.label ?? null,
            // An unset flag stays as stored, so a concurrent primary change is not undone.
            isPrimary: value.isPrimary,
            updatedAt: new Date(),
          })
          .where(target(contactIdentifiers, contactId, id))
          .returning()
          .catch(duplicateIdentifier);
        if (!row) throw new AccessDeniedError();
        return row;
      });
    },
    setPrimaryIdentifier(contactId: string, id: string) {
      return edit(contactId, async (ctx) => {
        const [existing] = await ctx.db
          .select()
          .from(contactIdentifiers)
          .where(target(contactIdentifiers, contactId, id));
        if (!existing) throw new AccessDeniedError();
        if (!existing.isPrimary)
          await clearPrimary(ctx, contactIdentifiers, contactId, id, existing.type);
        const [row] = await ctx.db
          .update(contactIdentifiers)
          .set({ isPrimary: true, updatedAt: new Date() })
          .where(target(contactIdentifiers, contactId, id))
          .returning()
          .catch(primaryChanged);
        if (!row) throw new AccessDeniedError();
        return row;
      });
    },
    removeIdentifier(contactId: string, id: string) {
      return edit(contactId, async (ctx) => {
        const rows = await ctx.db
          .delete(contactIdentifiers)
          .where(target(contactIdentifiers, contactId, id))
          .returning();
        if (!rows.length) throw new AccessDeniedError();
      });
    },
    async addAddress(contactId: string, input: AddressInput) {
      const value = parseInput(addressInput, input);
      return edit(contactId, async (ctx) => {
        if (value.isPrimary) await clearPrimary(ctx, contactAddresses, contactId);
        const [row] = await ctx.db
          .insert(contactAddresses)
          .values({ ...value, organizationId: scope.organizationId, contactEntityId: contactId })
          .returning()
          .catch(primaryChanged);
        return row!;
      });
    },
    async updateAddress(contactId: string, id: string, input: AddressInput) {
      const value = parseInput(addressInput, input);
      return edit(contactId, async (ctx) => {
        if (value.isPrimary) await clearPrimary(ctx, contactAddresses, contactId, id);
        const [row] = await ctx.db
          .update(contactAddresses)
          .set({
            ...value,
            streetAddress: value.streetAddress ?? null,
            extendedAddress: value.extendedAddress ?? null,
            city: value.city ?? null,
            region: value.region ?? null,
            postalCode: value.postalCode ?? null,
            countryCode: value.countryCode ?? null,
            formattedAddress: value.formattedAddress ?? null,
            label: value.label ?? null,
            updatedAt: new Date(),
          })
          .where(target(contactAddresses, contactId, id))
          .returning()
          .catch(primaryChanged);
        if (!row) throw new AccessDeniedError();
        return row;
      });
    },
    removeAddress(contactId: string, id: string) {
      return edit(contactId, async (ctx) => {
        const rows = await ctx.db
          .delete(contactAddresses)
          .where(target(contactAddresses, contactId, id))
          .returning();
        if (!rows.length) throw new AccessDeniedError();
      });
    },
    async addUrl(contactId: string, input: UrlInput) {
      const value = parseInput(urlInput, input);
      return edit(contactId, async (ctx) => {
        if (value.isPrimary) await clearPrimary(ctx, contactUrls, contactId);
        const [row] = await ctx.db
          .insert(contactUrls)
          .values({ ...value, organizationId: scope.organizationId, contactEntityId: contactId })
          .returning()
          .catch(duplicateUrl);
        return row!;
      });
    },
    async updateUrl(contactId: string, id: string, input: UrlInput) {
      const value = parseInput(urlInput, input);
      return edit(contactId, async (ctx) => {
        if (value.isPrimary) await clearPrimary(ctx, contactUrls, contactId, id);
        const [row] = await ctx.db
          .update(contactUrls)
          .set({ ...value, label: value.label ?? null, updatedAt: new Date() })
          .where(target(contactUrls, contactId, id))
          .returning()
          .catch(duplicateUrl);
        if (!row) throw new AccessDeniedError();
        return row;
      });
    },
    removeUrl(contactId: string, id: string) {
      return edit(contactId, async (ctx) => {
        const rows = await ctx.db
          .delete(contactUrls)
          .where(target(contactUrls, contactId, id))
          .returning();
        if (!rows.length) throw new AccessDeniedError();
      });
    },
  };
}
