/**
 * Run migration: add S3 document_key/document_url columns.
 * Usage: node scripts/run-migration-s3-document-columns.js
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mysql = require('mysql2/promise');
const fs = require('fs');

const DB = {
  host: process.env.MYSQL_HOST || 'localhost',
  port: parseInt(process.env.MYSQL_PORT || '3306', 10),
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'lending_platform',
  multipleStatements: true,
};

const SQL_PATH = path.join(__dirname, 'migrations', 'add-s3-document-columns.sql');

async function main() {
  const sql = fs.readFileSync(SQL_PATH, 'utf8');
  const conn = await mysql.createConnection(DB);
  try {
    await conn.query(sql);
    console.log('Migration completed: S3 document columns added where needed.');
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});

