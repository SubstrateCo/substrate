import * as schema from "./index";
import { expect, test } from "bun:test";
import { is } from "drizzle-orm";
import { getTableConfig, PgDialect, PgTable } from "drizzle-orm/pg-core";

const dialect = new PgDialect();
const column = String.raw`(?:"?\w+"?\.)?"?\w+"?(?:::text)?`;
const valueList = new RegExp(
  String.raw`^(?:${column} IS NULL OR )?${column} IN \('[^']*'(?:, ?'[^']*')*\)$`,
  "i",
);

test("check constraints never limit a column to a list of values", () => {
  const listChecks = Object.values(schema)
    .filter((value) => is(value, PgTable))
    .flatMap((table) => getTableConfig(table).checks)
    .filter((check) => valueList.test(dialect.sqlToQuery(check.value).sql.trim()))
    .map((check) => check.name);
  expect(listChecks).toEqual([]);
});
