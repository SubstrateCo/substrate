import { GoogleUnavailable } from "./errors";

/** The paging fields of a Google list response. */
export interface GooglePage {
  nextPageToken?: string;
  nextSyncToken?: string;
}

export interface GooglePages<Page extends GooglePage> extends AsyncIterable<Page> {
  /** The last page's `nextSyncToken`, after the iteration ends. Null when Google sent none. */
  readonly nextSyncToken: string | null;
}

// A busy list is a few pages. This stops a provider loop, not real data.
const defaultMaxPages = 200;

/**
 * Iterates a list through its `nextPageToken`s. `fetchPage` receives undefined for the first
 * page. More than `maxPages` pages throws GoogleUnavailable. Iterate it once.
 */
export function googlePages<Page extends GooglePage>(
  fetchPage: (pageToken: string | undefined) => Promise<Page>,
  options: { maxPages?: number } = {},
): GooglePages<Page> {
  const maxPages = options.maxPages ?? defaultMaxPages;
  let nextSyncToken: string | null = null;
  return {
    get nextSyncToken() {
      return nextSyncToken;
    },
    async *[Symbol.asyncIterator]() {
      let pageToken: string | undefined;
      for (let page = 0; page < maxPages; page++) {
        const body = await fetchPage(pageToken);
        yield body;
        pageToken = body.nextPageToken;
        if (!pageToken) {
          nextSyncToken = body.nextSyncToken ?? null;
          return;
        }
      }
      throw new GoogleUnavailable("provider_paging", "Google returned too many pages.");
    },
  };
}
