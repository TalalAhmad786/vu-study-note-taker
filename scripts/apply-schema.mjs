// Applies supabase/schema.sql. Usage: SUPABASE_DB_URL=postgresql://... npm run db:apply
import { readFile } from 'node:fs/promises';
import pg from 'pg';

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error('Set SUPABASE_DB_URL (Supabase → Project Settings → Database → Connection string, "Session pooler").');
  process.exit(1);
}
const sql = await readFile(new URL('../supabase/schema.sql', import.meta.url), 'utf8');
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query(sql);
  const { rows } = await client.query(
    "select table_name from information_schema.tables where table_schema = 'public' order by 1");
  console.log('Schema applied. Tables:', rows.map(r => r.table_name).join(', '));
} finally {
  await client.end();
}
