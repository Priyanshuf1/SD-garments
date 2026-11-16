/**
 * ALLEYRICH Database Migration Engine
 * Runs additive migrations in /migrations in transaction-isolated order.
 */

const fs = require('fs');
const path = require('path');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

async function runMigrations(pool, direction = 'up') {
  if (!pool) {
    console.warn('[MIGRATIONS] Database pool not provided or unconfigured. Skipping migrations.');
    return { applied: [], skipped: [] };
  }

  const client = await pool.connect();
  try {
    // 1. Ensure schema_migrations table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // 2. Discover migration files
    if (!fs.existsSync(MIGRATIONS_DIR)) {
      return { applied: [], skipped: [] };
    }

    const files = fs.readdirSync(MIGRATIONS_DIR)
      .filter(f => f.endsWith(`.${direction}.sql`))
      .sort();

    const existingRes = await client.query('SELECT version FROM schema_migrations;');
    const appliedSet = new Set(existingRes.rows.map(r => r.version));

    const applied = [];
    const skipped = [];

    if (direction === 'up') {
      for (const file of files) {
        const version = file.replace(/\.up\.sql$/, '');
        if (appliedSet.has(version)) {
          skipped.push(version);
          continue;
        }

        const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
        console.log(`[MIGRATION UP] Applying ${file}...`);
        await client.query('BEGIN;');
        try {
          await client.query(sql);
          await client.query('INSERT INTO schema_migrations (version) VALUES ($1);', [version]);
          await client.query('COMMIT;');
          applied.push(version);
          console.log(`[MIGRATION UP] ✓ Successfully applied ${version}`);
        } catch (migErr) {
          await client.query('ROLLBACK;');
          console.error(`[MIGRATION UP] ✗ Failed to apply ${file}:`, migErr.message);
          throw migErr;
        }
      }
    } else if (direction === 'down') {
      // Run down migrations in reverse order
      const reverseFiles = [...files].reverse();
      for (const file of reverseFiles) {
        const version = file.replace(/\.down\.sql$/, '');
        if (!appliedSet.has(version)) {
          skipped.push(version);
          continue;
        }

        const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
        console.log(`[MIGRATION DOWN] Rolling back ${file}...`);
        await client.query('BEGIN;');
        try {
          await client.query(sql);
          await client.query('DELETE FROM schema_migrations WHERE version = $1;', [version]);
          await client.query('COMMIT;');
          applied.push(version);
          console.log(`[MIGRATION DOWN] ✓ Successfully reverted ${version}`);
        } catch (migErr) {
          await client.query('ROLLBACK;');
          console.error(`[MIGRATION DOWN] ✗ Failed to revert ${file}:`, migErr.message);
          throw migErr;
        }
      }
    }

    return { applied, skipped };
  } finally {
    client.release();
  }
}

if (require.main === module) {
  const db = require('./db.js');
  const direction = process.argv[2] === 'down' ? 'down' : 'up';
  const pool = db.pool;
  if (!pool) {
    console.error('Cannot run migrations: PostgreSQL pool unavailable.');
    process.exit(1);
  }
  runMigrations(pool, direction)
    .then(({ applied, skipped }) => {
      console.log(`Migrations complete. Applied: ${applied.length}, Skipped: ${skipped.length}`);
      process.exit(0);
    })
    .catch((err) => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}

module.exports = {
  runMigrations
};
