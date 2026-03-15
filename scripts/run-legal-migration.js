/**
 * Run legal/compliance documents migration.
 * Uses same env as app (MYSQL_*). Run from repo root: node scripts/run-legal-migration.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const path = require('path');
const fs = require('fs');
const mysql = require('mysql2/promise');

async function main() {
  const config = {
    host: process.env.MYSQL_HOST || 'localhost',
    port: parseInt(process.env.MYSQL_PORT || '3306', 10),
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || 'lending_platform',
    multipleStatements: true,
  };

  const sqlPath = path.join(__dirname, 'migrations', 'add-legal-compliance-documents.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  console.log('Connecting to', config.host + ':' + config.port, config.database);
  const conn = await mysql.createConnection(config);
  try {
    await conn.query(sql);
    console.log('Migration completed: legal_documents, legal_document_versions, legal_document_assignments, legal_document_acceptances.');
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
