const m = require('mysql2/promise');
m.createConnection({
  host: '209.182.238.150', port: 3306,
  user: 'lms_user', password: 'LmsPortal@786',
  database: 'lending_platform'
}).then(async c => {
  // Check all tables
  const [tables] = await c.query('SHOW TABLES');
  console.log('TABLES:', tables.map(x => Object.values(x)[0]).join(','));
  // Loans with status REPAID/DEFAULTED for borrower 3
  const [lh] = await c.query('SELECT id,statusId,applicationId FROM loans WHERE borrowerId=3 AND statusId IN (3,4) LIMIT 5');
  console.log('HIST_LOANS:', JSON.stringify(lh));
  // loan_status values
  const [ls] = await c.query('SELECT * FROM loan_statuses');
  console.log('LOAN_STATUSES:', JSON.stringify(ls));
  c.end();
}).catch(e => console.error(e.message));
