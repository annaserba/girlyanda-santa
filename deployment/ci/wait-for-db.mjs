import pg from "pg";
const url = new URL(process.env.DATABASE_URL ?? "");
if (url.hostname !== "postgres" || url.pathname !== "/santa_verification")
  throw new Error("CI may only use the isolated santa_verification database");
const pool = new pg.Pool({
  connectionString: url.toString(),
  connectionTimeoutMillis: 1000,
});
let ready = false;
try {
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      const result = await pool.query("SELECT current_database() AS name");
      if (result.rows[0]?.name !== "santa_verification")
        throw new Error("Unexpected database");
      ready = true;
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
} finally {
  await pool.end();
}
if (!ready) throw new Error("CI PostgreSQL did not become ready");
console.log("Isolated verification database is ready");
