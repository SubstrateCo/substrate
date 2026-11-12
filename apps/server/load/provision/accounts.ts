import { client, config, json, type Account } from "./client";

const firstNames = [
  "Maya",
  "James",
  "Sofia",
  "Noah",
  "Amara",
  "Liam",
  "Isabel",
  "Ethan",
  "Aisha",
  "Lucas",
  "Priya",
  "Oliver",
  "Grace",
  "Mateo",
  "Chloe",
  "Daniel",
  "Nora",
  "Arjun",
  "Elena",
  "Leo",
];
const lastNames = [
  "Chen",
  "Patel",
  "Garcia",
  "Williams",
  "Kim",
  "Johnson",
  "Silva",
  "Brown",
  "Wilson",
  "Ahmed",
  "Martin",
  "Nguyen",
  "Davis",
  "Lopez",
  "Singh",
  "Anderson",
  "Thomas",
  "Taylor",
  "Moore",
  "Jackson",
];

async function verificationLink(email: string) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const search = await fetch(
      `${config.mailpitUrl}/api/v1/search?${new URLSearchParams({ query: `to:${email}`, limit: "50" })}`,
    );
    if (!search.ok) throw new Error(`Mailpit search: ${search.status}`);
    const { messages }: { messages: { ID: string; Subject: string }[] } = await search.json();
    const message = messages.find((item) => item.Subject === "Verify your Substrate email");
    if (message) {
      const response = await fetch(`${config.mailpitUrl}/api/v1/message/${message.ID}`);
      if (!response.ok) throw new Error(`Mailpit message: ${response.status}`);
      const { Text }: { Text: string } = await response.json();
      const link = Text.match(/https?:\/\/[^\s<>"']+/g)?.find(
        (value) => new URL(value).pathname === "/api/auth/verify-email",
      );
      if (link) {
        const url = new URL(link);
        if (![config.apiUrl, config.origin].includes(url.origin))
          throw new Error("Unexpected verification origin.");
        // Email links target the renderer proxy. Load tests have no renderer server.
        return `${config.apiUrl}${url.pathname}${url.search}`;
      }
    }
    await Bun.sleep(100);
  }
  throw new Error(`Verification email timed out: ${email}`);
}

export async function account(index: number): Promise<Account> {
  const email = `load-${String(index + 1).padStart(4, "0")}@load.test`;
  const name = `${firstNames[index % firstNames.length]} ${lastNames[Math.floor(index / firstNames.length) % lastNames.length]}`;
  const context = await client();
  const signIn = () =>
    context.post("/api/auth/sign-in/email", { data: { email, password: config.password } });
  let signedIn = await signIn();
  if (!signedIn.ok()) {
    if (![401, 403].includes(signedIn.status())) await json(signedIn);
    if (signedIn.status() === 401) {
      const created = await context.post("/api/auth/sign-up/email", {
        data: { email, name, password: config.password, callbackURL: "/login" },
      });
      // A previous attempt may have created the account before email verification finished.
      if (!created.ok() && created.status() !== 422) await json(created);
    }
    const verified = await context.get(await verificationLink(email), { maxRedirects: 0 });
    if (!verified.ok() && verified.status() !== 302) await json(verified);
    signedIn = await signIn();
  }
  const result = await json<{ user: { id: string } }>(signedIn);
  return { email, name, userId: result.user.id, organizationId: "", client: context };
}
