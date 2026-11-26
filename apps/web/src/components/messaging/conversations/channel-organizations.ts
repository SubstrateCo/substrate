export type ChannelOrganization = {
  id: string;
  name: string;
  host: boolean;
  own: boolean;
};

/** The viewer's own organization first, then the others in their given order. */
export function ownOrganizationFirst(organizations: readonly ChannelOrganization[]) {
  return [...organizations].sort((a, b) => Number(b.own) - Number(a.own));
}
