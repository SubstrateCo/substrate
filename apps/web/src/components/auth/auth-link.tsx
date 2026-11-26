import { createLink } from "@tanstack/react-router";

import { AuthLinkAnchor, AuthNavLinkAnchor } from "./auth-link-anchors";

export const AuthLink = createLink(AuthLinkAnchor);

export const AuthNavLink = createLink(AuthNavLinkAnchor);
