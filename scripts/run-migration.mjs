/**
 * Run full Supabase migration: all SQL files in supabase/migrations/ in order.
 * Uses Supabase client (exec_sql RPC) or PostgreSQL.
 *
 * Run: node scripts/run-migration.mjs
 * Or:  npm run db:migrate
 *
 * Prerequisites - use ONE of:
 * 1. SUPABASE_SERVICE_ROLE_KEY - Uses exec_sql RPC if available (no DB password needed)
 * 2. DATABASE_URL - Direct PostgreSQL connection (from Supabase Dashboard > Settings > Database)
 * 3. SUPABASE_DB_PASSWORD - Database password + NEXT_PUBLIC_SUPABASE_URL
 */

import pg from 'pg';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadEnv() {
    const envPath = path.join(__dirname, '..', '.env.local');
    const altPath = path.join(__dirname, '..', '.env');
    const p = fs.existsSync(envPath) ? envPath : fs.existsSync(altPath) ? altPath : null;
    if (!p) return {};
    return Object.fromEntries(
        fs.readFileSync(p, 'utf-8').split('\n')
            .filter(l => /^[A-Z_]+=/.test(l.trim()))
            .map(l => {
                const eq = l.indexOf('=');
                return [l.slice(0, eq).trim(), l.slice(eq + 1).trim()];
            })
    );
}

const env = { ...process.env, ...loadEnv() };
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const PROJECT_REF = SUPABASE_URL?.match(/([a-zA-Z0-9]{20,})\.supabase\.co/)?.[1];

let connectionString = env.DATABASE_URL;
let directConnection = null;
let sessionPoolerConnection = null;
const POOLER_REGIONS = ['us-east-1', 'eu-west-1', 'ap-southeast-1', 'ca-central-1', 'us-west-1'];
if (!connectionString && env.SUPABASE_DB_PASSWORD && PROJECT_REF) {
    const pw = encodeURIComponent(env.SUPABASE_DB_PASSWORD);
    // Try session mode on first region; we'll try others in main() if needed
    const region = POOLER_REGIONS[0];
    connectionString = `postgresql://postgres.${PROJECT_REF}:${pw}@aws-0-${region}.pooler.supabase.com:6543/postgres`;
    sessionPoolerConnection = `postgresql://postgres.${PROJECT_REF}:${pw}@aws-0-${region}.pooler.supabase.com:5432/postgres`;
    directConnection = `postgresql://postgres:${pw}@db.${PROJECT_REF}.supabase.co:5432/postgres`;
}

const migrationsDir = path.join(__dirname, '..', 'supabase', 'migrations');

function getMigrationFiles() {
    if (!fs.existsSync(migrationsDir)) {
        console.error('ERROR: Migrations directory not found:', migrationsDir);
        process.exit(1);
    }
    const files = fs.readdirSync(migrationsDir)
        .filter(f => f.endsWith('.sql'))
        .sort();
    if (files.length === 0) {
        console.error('ERROR: No .sql migration files in', migrationsDir);
        process.exit(1);
    }
    return files;
}

async function runViaSupabaseRpc(files) {
    if (!SUPABASE_URL || !SERVICE_KEY) return null;
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    for (const file of files) {
        const migrationPath = path.join(migrationsDir, file);
        const sql = fs.readFileSync(migrationPath, 'utf-8');
        const { error } = await supabase.rpc('exec_sql', { sql_query: sql });
        if (error) throw error;
        console.log('  OK:', file);
    }
    return true;
}

async function tryConnect(connStr, label) {
    console.log(`\nTrying ${label}...`);
    const client = new pg.Client({
        connectionString: connStr,
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 15000,
    });
    try {
        await client.connect();
        console.log(`Connected via ${label}!`);
        return client;
    } catch (err) {
        console.log(`${label} failed: ${err.message}`);
        return null;
    }
}

async function main() {
    const files = getMigrationFiles();
    const projectRef = PROJECT_REF || connectionString?.match(/postgres\.([a-zA-Z0-9]+)|db\.([a-zA-Z0-9]+)\.supabase/)?.[1] || 'project';

    console.log('=== Full Supabase Migration ===');
    console.log(`Project: ${projectRef}`);
    console.log(`Migrations (${files.length}):`);
    files.forEach(f => console.log('  -', f));
    console.log('');

    // Try exec_sql RPC first if we have service key
    if (SUPABASE_URL && SERVICE_KEY && !connectionString) {
        console.log('Using Supabase exec_sql RPC...');
        try {
            await runViaSupabaseRpc(files);
            console.log('\nAll migrations completed successfully via exec_sql RPC.');
            return;
        } catch (err) {
            if (err.message?.includes('exec_sql') || err.message?.includes('does not exist')) {
                console.log('exec_sql RPC not available, need DATABASE_URL or SUPABASE_DB_PASSWORD.');
            } else {
                console.error('RPC failed:', err.message);
            }
        }
    }

    // PostgreSQL connection: try DATABASE_URL first, then try each pooler region
    let client = null;
    if (connectionString && env.DATABASE_URL) {
        client = await tryConnect(connectionString, 'DATABASE_URL');
    }
    if (!client && env.SUPABASE_DB_PASSWORD && PROJECT_REF) {
        const pw = encodeURIComponent(env.SUPABASE_DB_PASSWORD);
        for (const region of POOLER_REGIONS) {
            const sessionUrl = `postgresql://postgres.${PROJECT_REF}:${pw}@aws-0-${region}.pooler.supabase.com:5432/postgres`;
            client = await tryConnect(sessionUrl, `Session pooler (${region}, port 5432)`);
            if (client) break;
            const transUrl = `postgresql://postgres.${PROJECT_REF}:${pw}@aws-0-${region}.pooler.supabase.com:6543/postgres`;
            client = await tryConnect(transUrl, `Transaction pooler (${region}, port 6543)`);
            if (client) break;
        }
    }
    if (!client && sessionPoolerConnection) {
        client = await tryConnect(sessionPoolerConnection, 'Session pooler (port 5432)');
    }
    if (!client && connectionString && !env.DATABASE_URL) {
        client = await tryConnect(connectionString, 'Transaction pooler (port 6543)');
    }
    if (!client && directConnection) {
        client = await tryConnect(directConnection, 'Direct connection (port 5432)');
    }

    if (!client) {
        console.error('\nERROR: Could not connect.');
        console.error('\nUse the exact connection string from Supabase:');
        console.error('  1. Dashboard → your project → Settings → Database');
        console.error('  2. Under "Connection string" choose "URI" and copy it');
        console.error('  3. In .env.local set: DATABASE_URL=<paste the URI>');
        console.error('     (Replace the [YOUR-PASSWORD] placeholder with your database password)\n');
        console.error('Or run the SQL manually in SQL Editor:');
        console.error(`  https://supabase.com/dashboard/project/${projectRef}/sql/new`);
        process.exit(1);
    }

    try {
        for (const file of files) {
            const migrationPath = path.join(migrationsDir, file);
            const sql = fs.readFileSync(migrationPath, 'utf-8');
            console.log('Executing:', file);
            await client.query(sql);
            console.log('  OK:', file);
        }
        console.log('\nAll migrations completed successfully.');
    } catch (err) {
        console.error('\nMigration failed:', err.message);
        if (err.message?.includes('already exists')) {
            console.error('\nSome objects may already exist; later migrations may still apply.');
        }
        process.exit(1);
    } finally {
        await client.end();
    }
}

main().catch(err => {
    console.error('Fatal error:', err.message);
    process.exit(1);
});
