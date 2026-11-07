import { authHref as href } from "./navigation";

export function authHref(path: string, redirect: string, email?: string) {
  return href(path, redirect, email, window.location.search);
}
