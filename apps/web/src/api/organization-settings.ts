import { api } from "./client";
import { readResult } from "./result";

export const getOrganizationSettingsAccess = () =>
  readResult(api.organizations["settings-access"].$get());
