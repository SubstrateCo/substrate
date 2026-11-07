import { testDatabaseURL } from "./environment.ts";
import postgres from "postgres";

export async function createTestDatabases(count: number) {
  const base = testDatabaseURL();
  const admin = postgres(base.href, { max: 1 });
  const names: string[] = [];
  const close = async () => {
    try {
      await Promise.all(names.map((name) => admin`DROP DATABASE ${admin(name)} WITH (FORCE)`));
    } finally {
      await admin.end();
    }
  };
  try {
    const prefix = `startup_os_${crypto.randomUUID().replaceAll("-", "")}`;
    for (let shard = 0; shard < count; shard++) {
      const name = `${prefix}_${shard}_test`;
      await admin`CREATE DATABASE ${admin(name)}`;
      names.push(name);
    }
  } catch (error) {
    await close();
    throw error;
  }
  return {
    connections: names.map((name) => {
      const url = new URL(base);
      url.pathname = `/${name}`;
      return url.href;
    }),
    close,
  };
}
