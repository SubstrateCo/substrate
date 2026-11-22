import { entityCursor } from "./core/repository-context";
import {
  ConflictError,
  ValidationError,
  isForeignKeyViolation,
  isInvalidTextRepresentation,
  isUniqueViolation,
  mapPostgresError,
  postgresErrorCode,
  violatedConstraint,
} from "./errors";
import { describe, expect, test } from "bun:test";
import postgres from "postgres";

function wrapped(code: string, constraint_name?: string) {
  const pg = new postgres.PostgresError("database error");
  pg.code = code;
  pg.constraint_name = constraint_name;
  return new Error("Failed query", { cause: pg });
}

describe("postgres error helpers", () => {
  test("extracts SQLSTATE code and constraint from direct and wrapped Postgres errors", () => {
    const direct = new postgres.PostgresError("duplicate");
    direct.code = "23505";
    direct.constraint_name = "entity_links_pair_unique";
    const err = wrapped("23503", "user_agent_picture_file_owner_fk");

    expect(postgresErrorCode(direct)).toBe("23505");
    expect(violatedConstraint(direct)).toBe("entity_links_pair_unique");
    expect(isUniqueViolation(direct)).toBe(true);
    expect(isUniqueViolation(direct, "entity_links_pair_unique")).toBe(true);
    expect(isUniqueViolation(direct, "other_unique")).toBe(false);

    expect(postgresErrorCode(err)).toBe("23503");
    expect(violatedConstraint(err)).toBe("user_agent_picture_file_owner_fk");
    expect(isForeignKeyViolation(err, "user_agent_picture_file_owner_fk")).toBe(true);
    expect(isForeignKeyViolation(err, "other_fk")).toBe(false);

    expect(isInvalidTextRepresentation(wrapped("22P02"))).toBe(true);
    expect(postgresErrorCode(new Error("plain"))).toBeUndefined();
    expect(violatedConstraint(new Error("plain"))).toBeUndefined();
  });

  test("maps 23505 to ConflictError and 23503 / 22P02 to ValidationError", () => {
    expect(() =>
      mapPostgresError(wrapped("23505", "entity_links_pair_unique"), {
        uniqueConstraint: { entity_links_pair_unique: "Already linked." },
      }),
    ).toThrow(new ConflictError("Already linked."));

    expect(() =>
      mapPostgresError(wrapped("23505", "any_constraint"), {
        unique: "Duplicate request.",
      }),
    ).toThrow(new ConflictError("Duplicate request."));

    expect(() =>
      mapPostgresError(wrapped("23503", "fk_target"), {
        foreignKeyConstraint: { fk_target: "Missing target." },
      }),
    ).toThrow(new ValidationError("Missing target."));

    expect(() =>
      mapPostgresError(wrapped("22P02"), {
        invalidInput: "Invalid identifier.",
      }),
    ).toThrow(new ValidationError("Invalid identifier."));

    const unmatched = wrapped("23505", "other_unique");
    expect(() =>
      mapPostgresError(unmatched, {
        uniqueConstraint: { entity_links_pair_unique: "Already linked." },
      }),
    ).toThrow(unmatched);
  });

  test("validates UUID entity cursors before querying Postgres", () => {
    const id = crypto.randomUUID();
    expect(entityCursor(undefined)).toBeUndefined();
    expect(entityCursor(id)).toBe(id);
    expect(() => entityCursor("not-a-uuid")).toThrow(ValidationError);
    expect(() => entityCursor("")).toThrow(ValidationError);
  });
});
