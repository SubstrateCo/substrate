export const appOrigin = new URL(process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000").origin;

export const mailpitURL = process.env.MAILPIT_BASE_URL ?? "http://localhost:8025";
