/**
 * Adds companies.rank if missing (MySQL 8: rank is reserved — column name is backtick-quoted in SQL).
 */
require('dotenv').config();
const mysql = require('mysql2/promise');

async function main() {
  const c = await mysql.createConnection({
    host: process.env.MYSQL_HOST || 'localhost',
    port: +(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || 'lending_platform',
  });
  try {
    await c.execute(
      'ALTER TABLE companies ADD COLUMN `rank` INT NULL AFTER admin_revision_note'
    );
    console.log('OK: companies.rank column added');
  } catch (e) {
    if (e.code === 'ER_DUP_FIELDNAME' || /Duplicate column/i.test(String(e.message))) {
      console.log('OK: companies.rank already exists');
    } else {
      throw e;
    }
  } finally {
    await c.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
