const mysql = require('mysql2/promise');

async function main() {
  const c = await mysql.createConnection({
    host: '209.182.238.150',
    port: 3306,
    user: 'lms_user',
    password: 'LmsPortal@786',
    database: 'lending_platform',
  });

  await c.query(`
    INSERT INTO transaction_logs (user_id, transaction_type, amount, status, created_at) VALUES
    (4, 'TOP_UP',              50000.00, 'COMPLETED', '2026-02-10 09:15:00'),
    (4, 'TOP_UP',              10000.00, 'COMPLETED', '2026-02-20 14:30:00'),
    (4, 'INVESTMENT',           2000.00, 'COMPLETED', '2026-01-12 11:05:00'),
    (4, 'INVESTMENT',           3000.00, 'COMPLETED', '2026-01-22 12:10:00'),
    (4, 'INVESTMENT',           2500.00, 'COMPLETED', '2026-03-01 09:05:00'),
    (4, 'REPAYMENT_RECEIVED',   2100.00, 'COMPLETED', '2026-02-28 16:00:00')
  `);

  console.log('Transactions seeded for lender (id=4)');
  await c.end();
}
main().catch(console.error);
