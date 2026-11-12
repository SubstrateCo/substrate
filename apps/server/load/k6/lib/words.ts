import { rng } from "./persona.ts";

// Workplace words from common to rare. Rank sets the Zipf weight, so early words appear in many
// messages and tasks (broad search hits) and late words in few (narrow hits).
const vocabulary = `
update review team meeting today release issue customer project design deploy fix test
plan feedback week call notes draft launch data report bug change status sprint deadline
api build docs priority roadmap budget client demo access user support ticket schedule
migration dashboard metrics question proposal contract invoice onboarding hiring offsite
quarter goals estimate scope risk blocker dependency handoff followup agenda summary
backend frontend mobile android ios web server database cache queue worker latency
outage incident postmortem rollback hotfix staging production preview branch merge pull
request pipeline ci coverage flaky regression performance memory cpu storage network
security audit compliance privacy policy legal vendor partner pricing discount renewal
churn retention signup checkout payment billing refund subscription trial upgrade
analytics funnel cohort experiment variant conversion campaign newsletter webinar blog
landing seo content video podcast social brand logo palette typography mockup prototype
wireframe research interview survey persona journey accessibility contrast keyboard
localization translation timezone calendar invite reminder notification email inbox
search filter export import csv spreadsheet chart forecast revenue margin headcount
payroll benefits holiday vacation expense travel hotel flight conference booth swag
warehouse shipment inventory supplier forklift pallet freight customs tariff carrier
patient clinic referral insurance claim prescription telehealth intake triage lab
solar turbine grid substation meter outage crew inspection permit utility rebate
kiln glaze portfolio illustration storyboard animation render shader texture rigging
sandbox webhook oauth token tenant shard replica vacuum index trigram tsvector planner
latte espresso pizza bagel donut picnic karaoke bowling trivia volunteer fundraiser
quokka zeppelin marmalade origami tamarind kumquat saffron obsidian juniper fjord
`
  .trim()
  .split(/\s+/);

// Exponent near 1 gives the long tail of natural text.
const cumulative: number[] = [];
vocabulary.reduce((sum, _, rank) => {
  cumulative.push(sum + 1 / Math.pow(rank + 1, 1.05));
  return cumulative.at(-1)!;
}, 0);

/** One vocabulary word, Zipf-distributed. */
export function word() {
  const roll = rng.next() * cumulative.at(-1)!;
  let low = 0;
  let high = cumulative.length - 1;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (cumulative[middle]! < roll) low = middle + 1;
    else high = middle;
  }
  return vocabulary[low]!;
}

const glue = ["the", "a", "to", "for", "on", "in", "with", "and", "is", "we", "it", "this"];
const openers = [
  "",
  "",
  "",
  "hey, ",
  "quick one: ",
  "fyi ",
  "ok so ",
  "thanks! ",
  "+1, ",
  "update: ",
];
const verbs = [
  "Fix",
  "Update",
  "Review",
  "Draft",
  "Ship",
  "Plan",
  "Check",
  "Add",
  "Clean up",
  "Investigate",
  "Write",
  "Prepare",
];

function phrase(count: number) {
  const parts: string[] = [];
  for (let i = 0; i < count; i++) {
    if (i > 0 && rng.chance(0.45)) parts.push(rng.pick(glue)!);
    parts.push(word());
  }
  return parts.join(" ");
}

function sentence(min: number, max: number) {
  const text = phrase(rng.int(min, max));
  return text.charAt(0).toUpperCase() + text.slice(1) + rng.pick([".", ".", ".", "?", "!"])!;
}

function paragraph(sentences: number) {
  return Array.from({ length: sentences }, () => sentence(5, 14)).join(" ");
}

/** A chat message: mostly short, sometimes a few sentences, rarely several paragraphs. */
export function messageBody() {
  const roll = rng.next();
  if (roll < 0.55) return rng.pick(openers)! + phrase(rng.int(2, 8));
  if (roll < 0.85) return rng.pick(openers)! + sentence(8, 20);
  if (roll < 0.97) return paragraph(rng.int(2, 4));
  return Array.from({ length: rng.int(2, 4) }, () => paragraph(rng.int(2, 5))).join("\n\n");
}

export function taskTitle() {
  return `${rng.pick(verbs)!} ${phrase(rng.int(2, 6))}`;
}

/** Often empty; otherwise a few sentences, sometimes with a checklist. */
export function taskDescription() {
  if (rng.chance(0.35)) return "";
  const text = paragraph(rng.int(1, 3));
  if (!rng.chance(0.3)) return text;
  const items = Array.from({ length: rng.int(2, 5) }, () => `- [ ] ${phrase(rng.int(2, 5))}`);
  return `${text}\n\n${items.join("\n")}`;
}

export function comment() {
  return rng.chance(0.6) ? rng.pick(openers)! + phrase(rng.int(3, 10)) : paragraph(rng.int(1, 2));
}

/** What someone types in a search box: usually one word, sometimes two, rarely a miss. */
export function searchTerm() {
  const roll = rng.next();
  if (roll < 0.7) return word();
  if (roll < 0.92) return `${word()} ${word()}`;
  return `${word().slice(0, 4)}${rng.pick(["x", "zz", "q"])!}`;
}

/**
 * The prefixes a search box settles on while `text` is typed: people type in bursts of a few
 * characters, and each pause longer than the debounce sends a search.
 */
export function typedPrefixes(text: string) {
  const prefixes: string[] = [];
  let length = Math.min(text.length, rng.int(2, 4));
  while (length < text.length) {
    prefixes.push(text.slice(0, length));
    length += rng.int(2, 5);
  }
  prefixes.push(text);
  return prefixes;
}
