const m = require('./node_modules/mysql2/promise');
m.createConnection({
  host: '209.182.238.150', port: 3306,
  user: 'lms_user', password: 'LmsPortal@786',
  database: 'lending_platform'
}).then(async c => {
  const [a] = await c.query('SELECT * FROM loan_applications WHERE id=22');
  console.log('APP22:', JSON.stringify(a[0]));
  const [l] = await c.query('SELECT * FROM loans WHERE id=9');
  console.log('LOAN9:', JSON.stringify(l[0]));
  const [lh] = await c.query('SELECT statusId,id FROM loans WHERE borrowerId=3 LIMIT 10');
  console.log('BORROWERLOANS:', JSON.stringify(lh));
  const [repa] = await c.query('SELECT * FROM repayments WHERE loan_id=9 LIMIT 3');
  console.log('REPA9:', JSON.stringify(repa));
  const [reps] = await c.query('SHOW COLUMNS FROM repayments');
  console.log('REPA_COLS:', reps.map(x => x.Field).join(','));
  c.end();
}).catch(e => console.error(e.message));
