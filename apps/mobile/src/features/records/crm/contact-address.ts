export type AddressText = {
  label: string;
  streetAddress: string;
  extendedAddress: string;
  city: string;
  region: string;
  postalCode: string;
  countryCode: string;
  formattedAddress: string;
};

type StoredAddress = { [K in keyof AddressText]: string | null };

export function addressText(address: StoredAddress): AddressText {
  return {
    label: address.label ?? "",
    streetAddress: address.streetAddress ?? "",
    extendedAddress: address.extendedAddress ?? "",
    city: address.city ?? "",
    region: address.region ?? "",
    postalCode: address.postalCode ?? "",
    countryCode: address.countryCode ?? "",
    formattedAddress: address.formattedAddress ?? "",
  };
}

export function addressInput(text: AddressText): StoredAddress | null {
  const value = (field: string) => field.trim() || null;
  const countryCode = value(text.countryCode)?.toUpperCase() ?? null;
  if (countryCode !== null && !/^[A-Z]{2}$/.test(countryCode)) return null;
  const input: StoredAddress = {
    label: value(text.label),
    streetAddress: value(text.streetAddress),
    extendedAddress: value(text.extendedAddress),
    city: value(text.city),
    region: value(text.region),
    postalCode: value(text.postalCode),
    countryCode,
    formattedAddress: value(text.formattedAddress),
  };
  const { label: _label, ...content } = input;
  return Object.values(content).some((field) => field !== null) ? input : null;
}

export function addressLine(address: StoredAddress) {
  return (
    address.formattedAddress ??
    [
      address.streetAddress,
      address.extendedAddress,
      address.city,
      address.region,
      address.postalCode,
      address.countryCode,
    ]
      .filter(Boolean)
      .join(", ")
  );
}
