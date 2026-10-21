/**
 * Database Migration Script
 * Connects to Supabase PostgreSQL and applies supabase/schema.sql
 */

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const DB_PASS = process.env.DB_PASSWORD || process.env.SUPABASE_DB_PASSWORD || '';
const DB_HOST = process.env.DB_HOST || 'db.shhjnxarewideotbhzby.supabase.co';

async function migrate() {
  console.log('🔌 Connecting to Supabase PostgreSQL at:', DB_HOST);

  const client = new Client({
    host: DB_HOST,
    port: 5432,
    user: 'postgres',
    password: DB_PASS,
    database: 'postgres',
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('✅ Connected successfully to Supabase PostgreSQL!');

    const schemaPath = path.join(__dirname, 'supabase', 'schema.sql');
    const sql = fs.readFileSync(schemaPath, 'utf8');

    console.log('📜 Executing supabase/schema.sql...');
    await client.query(sql);
    console.log('✅ Schema executed successfully!');

    // Verify created tables
    const res = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `);

    const tables = res.rows.map(r => r.table_name);
    console.log(`\n🎉 Tables successfully created in public schema (${tables.length}):`);
    tables.forEach(t => console.log(`  - ${t}`));

    await client.end();
    return true;
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    try { await client.end(); } catch (e) {}
    return false;
  }
}

migrate().then(success => {
  if (success) {
    console.log('\n🚀 Starting catalog migration to populate 245 products...');
    require('./migrate_catalog_to_supabase.js');
  } else {
    process.exit(1);
  }
});
