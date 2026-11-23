import type { MailStore, SyncedMail } from "@substrate/client-storage/mail";
import { mailFlag } from "@substrate/contracts/mail";

export const newsletterImages = [
  "https://images.example.test/logo.png",
  "https://images.example.test/poster.png",
];
export function fixturePicture(source: string) {
  return newsletterImages.includes(source)
    ? "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII="
    : null;
}

const newsletter = `<style>
  .tickets { background-color: #293858 }
  @media (max-width: 440px) { .screen { display: block; width: auto } }
  </style><img src="${newsletterImages[0]}" alt="Westhaven Cinema" width="48">
  <table width="600"><tr><td class="screen" background="${newsletterImages[1]}">
  <table height="160"><tr><td><h2>Night train</h2></td></tr></table></td>
  <td class="screen"><h2>Sunday matinee</h2></td></tr></table>
  <a class="tickets" href="https://westhaven.example/programme">See the programme</a>`;

export async function seedInbox(store: MailStore) {
  const work = "alex@fieldwork.example",
    personal = "alex.home@personal.example";
  const now = Date.now();
  const message = (
    remoteId: string,
    subject: string,
    minutesAgo: number,
    fields: Partial<SyncedMail> = {},
  ): SyncedMail => ({
    remoteId,
    subject,
    timestamp: now - minutesAgo * 60_000,
    from: "Mira Park <mira@example.test>",
    to: work,
    threadId: null,
    flags: mailFlag.inbox | mailFlag.unread,
    labelIds: [],
    snippet: "",
    body: { format: "plain", text: subject },
    ...fields,
  });
  const proof = "Atlas cover proofs",
    first = "The first round is ready for review.";
  const invite =
    "Join with Google Meet\nFriday 10:00am\nEastern Time – Toronto\nhttps://meet.google.com/abc-defg-hij\nJoin by phone";
  for (const address of [work, personal]) {
    const id = await store.connect({
      provider: "gmail",
      providerAccountId: address,
      address,
      nickname: null,
      protectedGrant: "test-only",
    });
    await store.labels(
      id,
      address === work
        ? [
            { id: "print", name: "Atlas / Print" },
            { id: "review", name: "Review" },
            { id: "studio", name: "Studio updates" },
            { id: "deadline", name: "Release checklist" },
            { id: "notes", name: "Meeting notes" },
            { id: "CATEGORY_PROMOTIONS", name: "CATEGORY_PROMOTIONS" },
          ]
        : [{ id: "family", name: "Family" }],
    );
    const messages =
      address === work
        ? [
            message("first", proof, 75, {
              threadId: "proof",
              flags: mailFlag.inbox,
              snippet: first,
              labelIds: ["review"],
              body: { format: "plain", text: first },
            }),
            message("reply", proof, 65, {
              threadId: "proof",
              flags: mailFlag.sent,
              from: `Alex Rivera <${work}>`,
              body: { format: "plain", text: "I’ll compare the two proofs this afternoon." },
            }),
            message("cover", proof, 5, {
              threadId: "proof",
              flags: mailFlag.inbox | mailFlag.unread | mailFlag.starred,
              labelIds: ["review", "print"],
              body: {
                format: "html",
                text: '<a href="https://foldpress.example/proofs">View cover proofs</a><img src="https://images.example.test/proof.png" alt="Color proof">',
              },
            }),
            message("unicode", "Notes from ÉCOLE", 95, {
              labelIds: ["print", "review", "studio", "deadline", "notes"],
            }),
            message("draft", "Unsent proposal", 10, { flags: mailFlag.drafts }),
            message("spam", "Filtered offer", 20, { flags: mailFlag.spam | mailFlag.unread }),
            message("trash", "Discarded invitation", 40, {
              flags: mailFlag.trash | mailFlag.unread,
            }),
          ]
        : [
            message("invite", "Dates for the gallery visit", 30, {
              to: personal,
              body: { format: "plain", text: invite },
            }),
            message("newsletter", "Last month’s film programme", 24 * 60, {
              to: personal,
              flags: 0,
              body: { format: "html", text: newsletter },
            }),
            message("old", "Older cached itinerary", 5 * 24 * 60, {
              to: personal,
              flags: mailFlag.inbox,
            }),
          ];
    await store.commit(id, null, { messages, removed: [], cursor: "seeded", done: true });
  }
}
