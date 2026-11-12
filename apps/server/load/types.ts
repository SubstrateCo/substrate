export interface LoadUser {
  email: string;
  name: string;
  userId: string;
  organizationId: string;
  crm?: {
    accountEntityId: string;
    contactEntityId: string;
    dealEntityId: string;
    projectEntityId: string;
  };
}

export interface LoadOrganization {
  id: string;
  slug: string;
  name: string;
  ownerEmail: string;
  memberEmails: string[];
}
