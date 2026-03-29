'use strict';

/**
 * Seed: company.demo@lms.com
 * Creates a demo Company record + its COMPANY-role user (status: APPROVED).
 *
 * Run: node scripts/seed-company-demo.js
 */

const mysql = require('mysql2/promise');

const DB = {
  host: '209.182.238.150',
  port: 3306,
  user: 'lms_user',
  password: 'LmsPortal@786',
  database: 'lending_platform',
};

// bcrypt hash for "CompanyDemo!123"
const PWD_HASH = '$2b$10$BjpV3dWHSdbhkyqkF0.//ed.PjLhLTzJXcoUpOxpbj02MlDnPXIxq';

// role_id: 4 = COMPANY  |  status_id: 2 = APPROVED
const ROLE_COMPANY  = 4;
const STATUS_APPROVED = 2;

async function main() {
  const db = await mysql.createConnection(DB);
  console.log('Connected to DB');

  try {
    // 1. Upsert the company record
    const companyName = 'Demo Company Sp. z o.o.';
    const [existing] = await db.query(
      'SELECT id FROM companies WHERE name = ? LIMIT 1',
      [companyName]
    );

    let companyId;
    if (existing.length > 0) {
      companyId = existing[0].id;
      await db.query(
        'UPDATE companies SET status_id = ?, updated_at = NOW() WHERE id = ?',
        [STATUS_APPROVED, companyId]
      );
      console.log(`Company already exists (id=${companyId}), status set to APPROVED.`);
    } else {
      const [result] = await db.query(
        `INSERT INTO companies (name, status_id, commission_pct, min_managed_amount, created_at, updated_at)
         VALUES (?, ?, 0.00, 0.00, NOW(), NOW())`,
        [companyName, STATUS_APPROVED]
      );
      companyId = result.insertId;
      console.log(`Company created (id=${companyId}).`);
    }

    // 2. Upsert the user
    const [userExisting] = await db.query(
      'SELECT id FROM users WHERE email = ? LIMIT 1',
      ['company.demo@lms.com']
    );

    if (userExisting.length > 0) {
      const userId = userExisting[0].id;
      await db.query(
        `UPDATE users
         SET password_hash = ?, role_id = ?, status_id = ?, company_id = ?,
             first_name = ?, last_name = ?, updated_at = NOW()
         WHERE id = ?`,
        [PWD_HASH, ROLE_COMPANY, STATUS_APPROVED, companyId, 'Demo', 'Company', userId]
      );
      console.log(`User updated (id=${userId}) => email=company.demo@lms.com, role=COMPANY, status=APPROVED`);
    } else {
      const [result] = await db.query(
        `INSERT INTO users
           (email, password_hash, role_id, status_id, level, first_name, last_name,
            company_id, is_super_admin, created_at, updated_at)
         VALUES (?, ?, ?, ?, 0, 'Demo', 'Company', ?, 0, NOW(), NOW())`,
        ['company.demo@lms.com', PWD_HASH, ROLE_COMPANY, STATUS_APPROVED, companyId]
      );
      console.log(`User created (id=${result.insertId}) => email=company.demo@lms.com, role=COMPANY, status=APPROVED`);
    }

    console.log('\nDone.');
    console.log('  Email    : company.demo@lms.com');
    console.log('  Password : CompanyDemo!123');
    console.log('  Role     : COMPANY');
    console.log('  Status   : APPROVED');
  } finally {
    await db.end();
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
