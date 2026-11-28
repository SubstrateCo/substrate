import { GoogleUnavailable } from "./errors";

export interface GooglePage {
  nextPageToken?: string;
  nextSyncToken?: string;
}

export interface GooglePages<Page extends GooglePage> extends AsyncIterable<Page> {
  readonly nextSyncToken: string | null;
}

const defaultMaxPages = 200;

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
