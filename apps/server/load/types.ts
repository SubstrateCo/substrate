export interface LoadUser {
  email: string;
  name: string;
  userId: string;
  organizationId: string;
}

export interface LoadOrganization {
  id: string;
  slug: string;
  name: string;
  ownerEmail: string;
  memberEmails: string[];
}
