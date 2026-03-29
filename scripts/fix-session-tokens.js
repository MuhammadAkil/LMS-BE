const mysql = require('mysql2/promise');

(async () => {
  const conn = await mysql.createConnection({
    host: '209.182.238.150',
    port: 3306,
    user: 'lms_user',
    password: 'LmsPortal@786',
    database: 'lending_platform'
  });

  try {
    // Show what we're about to delete
    const [dirty] = await conn.query(
      "SELECT id, user_id, token, expires_at FROM user_sessions WHERE token = '' OR token IS NULL"
    );
    console.log('Dirty rows (empty/null token):', dirty.length);
    if (dirty.length > 0) {
      console.log(JSON.stringify(dirty, null, 2));
    }

    // Also show any duplicate tokens
    const [dupes] = await conn.query(
      "SELECT token, COUNT(*) as cnt FROM user_sessions GROUP BY token HAVING cnt > 1"
    );
    console.log('Duplicate tokens:', dupes.length);
    if (dupes.length > 0) {
      console.log(JSON.stringify(dupes, null, 2));
    }

    // Delete rows with empty or null tokens
    const [r1] = await conn.query(
      "DELETE FROM user_sessions WHERE token = '' OR token IS NULL"
    );
    console.log('Deleted empty/null token rows:', r1.affectedRows);

    // Delete duplicate rows keeping only the most recent per user_id
    const [r2] = await conn.query(`
      DELETE s1 FROM user_sessions s1
      INNER JOIN user_sessions s2
        ON s1.user_id = s2.user_id AND s1.id < s2.id
    `);
    console.log('Deleted older duplicate sessions per user:', r2.affectedRows);

    // Final count
    const [remaining] = await conn.query('SELECT COUNT(*) as cnt FROM user_sessions');
    console.log('Remaining sessions:', remaining[0].cnt);

    console.log('\nDone. You can now restart the backend.');
  } finally {
    await conn.end();
  }
})().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
