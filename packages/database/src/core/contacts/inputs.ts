import { ValidationError } from "../../errors";
import { isSupportedCountry, parsePhoneNumberFromString } from "libphonenumber-js";
import { z } from "zod";

const optionalText = z.string().trim().min(1).max(1000).nullable().optional();
export const contactProfileInput = z.object({
  displayName: z.string().trim().min(1).max(1000),
  givenName: optionalText,
  middleName: optionalText,
  familyName: optionalText,
  namePrefix: optionalText,
  nameSuffix: optionalText,
  nickname: optionalText,
  notes: z.string().max(50000).nullable().optional(),
});
const detailInput = z.object({ label: optionalText, isPrimary: z.boolean().optional() });
export const identifierInput = detailInput.extend({
  type: z.enum(["email", "phone"]),
  value: z.string().trim().min(1).max(1000),
  extension: z
    .string()
    .trim()
    .regex(/^[0-9]+$/)
    .max(20)
    .nullable()
    .optional(),
  countryCode: z.string().length(2).optional(),
});
export const addressInput = detailInput
  .extend({
    streetAddress: optionalText,
    extendedAddress: optionalText,
    city: optionalText,
    region: optionalText,
    postalCode: optionalText,
    countryCode: z
      .string()
      .regex(/^[A-Z]{2}$/)
      .nullable()
      .optional(),
    formattedAddress: optionalText,
  })
  .refine(
    (input) =>
      [
        input.streetAddress,
        input.extendedAddress,
        input.city,
        input.region,
        input.postalCode,
        input.countryCode,
        input.formattedAddress,
      ].some(Boolean),
    "Enter an address.",
  );
export const urlInput = detailInput.extend({
  url: z.url({ protocol: /^https?$/ }).max(4000),
});

export function parseInput<T extends z.ZodType>(schema: T, input: z.input<T>): z.output<T> {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new ValidationError(result.error.issues.map((issue) => issue.message).join(" "));
  return result.data;
}

export function normalizedIdentifier(input: z.input<typeof identifierInput>) {
  const { countryCode, ...value } = parseInput(identifierInput, input);
  if (value.type === "email") {
    if (value.extension) throw new ValidationError("Only phone numbers can have extensions.");
    if (!z.email().safeParse(value.value).success)
      throw new ValidationError("Enter a valid email address.");
    const at = value.value.lastIndexOf("@");
    return {
      ...value,
      normalizedValue: value.value.slice(0, at) + value.value.slice(at).toLowerCase(),
    };
  }
  if (countryCode && !isSupportedCountry(countryCode))
    throw new ValidationError("Enter a supported phone country code.");
  const phone = parsePhoneNumberFromString(value.value, {
    defaultCountry: countryCode && isSupportedCountry(countryCode) ? countryCode : undefined,
    extract: false,
  });
  return {
    ...value,
    extension: value.extension ?? phone?.ext ?? null,
    normalizedValue: phone?.isValid() ? phone.number : null,
  };
}

export type ContactInput = z.input<typeof contactProfileInput>;
export type IdentifierInput = z.input<typeof identifierInput>;
export type AddressInput = z.input<typeof addressInput>;
export type UrlInput = z.input<typeof urlInput>;
