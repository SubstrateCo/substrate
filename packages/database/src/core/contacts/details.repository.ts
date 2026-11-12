import { AccessDeniedError } from "../../errors";
import { RepositoryContext, pageSize } from "../repository-context";
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
import { contactIdentifiers, contacts } from "./schema";
import { and, asc, eq, sql } from "drizzle-orm";

export function contactDetailsRepository(context: RepositoryContext) {
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
      const { entity } = await ctx.requireAccess(contactId, "edit", true);
      if (entity.entityType !== "contact") throw new AccessDeniedError();
      // Serialize detail edits, including replacing a primary value, on the parent row.
      const [contact] = await ctx.db
        .select()
        .from(contacts)
        .where(
          and(eq(contacts.organizationId, scope.organizationId), eq(contacts.entityId, contactId)),
        )
        .for("update");
      if (!contact) throw new AccessDeniedError();
      const result = await work(ctx);
      await ctx.touch(contactId);
      return result;
    });
  }

  async function clearPrimary(
    ctx: RepositoryContext,
    table: typeof contactIdentifiers | typeof contactAddresses | typeof contactUrls,
    contactId: string,
    type?: "email" | "phone",
  ) {
    await ctx.db
      .update(table)
      .set({ isPrimary: false, updatedAt: new Date() })
      .where(
        and(
          target(table, contactId),
          eq(table.isPrimary, true),
          type ? eq(contactIdentifiers.type, type) : undefined,
        ),
      );
  }

  return {
    async getDetail(contactId: string) {
      await context.requireAccess(contactId, "view");
      const [profile] = await db
        .select()
        .from(contacts)
        .where(
          and(eq(contacts.organizationId, scope.organizationId), eq(contacts.entityId, contactId)),
        );
      if (!profile) throw new AccessDeniedError();
      const [identifiers, addresses, urls] = await Promise.all([
        db
          .select()
          .from(contactIdentifiers)
          .where(target(contactIdentifiers, contactId))
          .orderBy(asc(contactIdentifiers.id)),
        db
          .select()
          .from(contactAddresses)
          .where(target(contactAddresses, contactId))
          .orderBy(asc(contactAddresses.id)),
        db
          .select()
          .from(contactUrls)
          .where(target(contactUrls, contactId))
          .orderBy(asc(contactUrls.id)),
      ]);
      return { profile, identifiers, addresses, urls };
    },

    async findByIdentifier(
      input: IdentifierInput,
      options: { limit?: number; afterEntityId?: string } = {},
    ) {
      await context.requireActiveActor();
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
            context.readable(contacts.entityId),
            eq(contactIdentifiers.type, value.type),
            value.normalizedValue
              ? eq(contactIdentifiers.normalizedValue, value.normalizedValue)
              : eq(contactIdentifiers.value, value.value),
            sql`coalesce(${contactIdentifiers.extension}, '') = ${value.extension ?? ""}`,
            options.afterEntityId
              ? sql`${contacts.entityId} > ${options.afterEntityId}::uuid`
              : undefined,
          ),
        )
        .orderBy(asc(contacts.entityId))
        .limit(pageSize(options.limit));
    },

    async addIdentifier(contactId: string, input: IdentifierInput) {
      const value = normalizedIdentifier(input);
      return edit(contactId, async (ctx) => {
        if (value.isPrimary) await clearPrimary(ctx, contactIdentifiers, contactId, value.type);
        const [row] = await ctx.db
          .insert(contactIdentifiers)
          .values({ ...value, organizationId: scope.organizationId, contactEntityId: contactId })
          .returning();
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
        if (isPrimary) await clearPrimary(ctx, contactIdentifiers, contactId, value.type);
        const [row] = await ctx.db
          .update(contactIdentifiers)
          .set({
            ...value,
            extension: value.extension ?? null,
            label: value.label ?? null,
            isPrimary,
            updatedAt: new Date(),
          })
          .where(target(contactIdentifiers, contactId, id))
          .returning();
        return row!;
      });
    },
    setPrimaryIdentifier(contactId: string, id: string) {
      return edit(contactId, async (ctx) => {
        const [existing] = await ctx.db
          .select()
          .from(contactIdentifiers)
          .where(target(contactIdentifiers, contactId, id));
        if (!existing) throw new AccessDeniedError();
        await clearPrimary(ctx, contactIdentifiers, contactId, existing.type);
        const [row] = await ctx.db
          .update(contactIdentifiers)
          .set({ isPrimary: true, updatedAt: new Date() })
          .where(target(contactIdentifiers, contactId, id))
          .returning();
        return row!;
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
          .returning();
        return row!;
      });
    },
    async updateAddress(contactId: string, id: string, input: AddressInput) {
      const value = parseInput(addressInput, input);
      return edit(contactId, async (ctx) => {
        if (value.isPrimary) await clearPrimary(ctx, contactAddresses, contactId);
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
          .returning();
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
          .returning();
        return row!;
      });
    },
    async updateUrl(contactId: string, id: string, input: UrlInput) {
      const value = parseInput(urlInput, input);
      return edit(contactId, async (ctx) => {
        if (value.isPrimary) await clearPrimary(ctx, contactUrls, contactId);
        const [row] = await ctx.db
          .update(contactUrls)
          .set({ ...value, label: value.label ?? null, updatedAt: new Date() })
          .where(target(contactUrls, contactId, id))
          .returning();
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
