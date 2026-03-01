const m = require('mysql2/promise');
m.createConnection({
  host: '209.182.238.150', port: 3306,
  user: 'lms_user', password: 'LmsPortal@786',
  database: 'lending_platform'
}).then(async c => {
  for (const t of ['repayments', 'audit_logs', 'loan_offers', 'documents']) {
    const [cols] = await c.query('SHOW COLUMNS FROM ' + t);
    console.log(t + ': ' + cols.map(x => x.Field).join(','));
  }
  c.end();
}).catch(e => console.error(e.message));
