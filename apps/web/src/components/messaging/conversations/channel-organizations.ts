export type ChannelOrganization = {
  id: string;
  name: string;
  host: boolean;
  own: boolean;
};

export function ownOrganizationFirst(organizations: readonly ChannelOrganization[]) {
  return [...organizations].sort((a, b) => Number(b.own) - Number(a.own));
}
