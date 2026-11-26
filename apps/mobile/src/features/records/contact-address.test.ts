import { addressInput, addressLine, addressText } from "./contact-address";
import { expect, test } from "bun:test";

const blank = addressText({
  label: null,
  streetAddress: null,
  extendedAddress: null,
  city: null,
  region: null,
  postalCode: null,
  countryCode: null,
  formattedAddress: null,
});

test("saving an address clears blank fields and stores the country in upper case", () => {
  expect(addressInput({ ...blank, city: "  Berlin ", countryCode: "de", label: " " })).toEqual({
    label: null,
    streetAddress: null,
    extendedAddress: null,
    city: "Berlin",
    region: null,
    postalCode: null,
    countryCode: "DE",
    formattedAddress: null,
  });
});

test("an address with only a label, or an invalid country, is not saved", () => {
  expect(addressInput({ ...blank, label: "Office" })).toBeNull();
  expect(addressInput({ ...blank, city: "Berlin", countryCode: "DEU" })).toBeNull();
});

test("editing keeps an address written as one line", () => {
  const stored = { ...addressInput({ ...blank, formattedAddress: "1 Main St, Springfield" })! };
  expect(addressInput(addressText(stored))).toEqual(stored);
  expect(addressLine(stored)).toBe("1 Main St, Springfield");
});
