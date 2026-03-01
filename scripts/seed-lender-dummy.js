// Seed script: verify lender@lms.com (id=4) and add comprehensive dummy data
const mysql = require('mysql2/promise');

async function main() {
  const c = await mysql.createConnection({
    host: '209.182.238.150',
    port: 3306,
    user: 'lms_user',
    password: 'LmsPortal@786',
    database: 'lending_platform',
  });

  // ─── 1. Update user profile & set level = 2 (fully verified) ───────────────
  await c.query(`
    UPDATE users SET
      first_name      = 'Anna',
      last_name       = 'Nowak',
      phone           = '+48123456789',
      bank_account    = 'PL61109010140000071219812874',
      pesel           = '85042312345',
      address         = 'ul. Złota 12/5, 00-003 Warszawa',
      level           = 2
    WHERE id = 4
  `);
  console.log('1. User profile updated, level set to 2');

  // ─── 2. Insert APPROVED verifications for all 6 verification types ──────────
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const verifs = [
    [4, 1, 2, now, 2, now, 'ID document verified successfully',
      JSON.stringify({ docType: 'PASSPORT', docNumber: 'AB123456' })],
    [4, 2, 2, now, 2, now, 'Proof of address approved',
      JSON.stringify({ docType: 'UTILITY_BILL', issueDate: '2026-01-10' })],
    [4, 3, 2, now, 2, now, 'Income documentation verified',
      JSON.stringify({ employer: 'Tech Sp. z o.o.', monthlyIncome: 12000 })],
    [4, 4, 2, now, 2, now, 'BIK credit bureau check passed',
      JSON.stringify({ score: 720, reportDate: '2026-02-01' })],
    [4, 5, 2, now, 2, now, 'Phone number verified via SMS',
      JSON.stringify({ phone: '+48123456789' })],
    [4, 6, 2, now, 2, now, 'Email address verified',
      JSON.stringify({ email: 'lender@lms.com' })],
  ];

  const [verifRes] = await c.query(
    `INSERT INTO user_verifications
       (user_id, verification_type_id, status_id, created_at, reviewed_by, reviewed_at, review_comment, metadata)
     VALUES ?`,
    [verifs]
  );
  const firstVerifId = Number(verifRes.insertId);
  console.log('2. Verifications inserted (IDs', firstVerifId, '-', firstVerifId + 5, ')');

  // ─── 3. Insert verification documents (one per verification) ────────────────
  const docs = Array.from({ length: 6 }, (_, i) => [
    firstVerifId + i,
    `/uploads/lender_4/doc_verif_${i + 1}.pdf`,
  ]);
  await c.query('INSERT INTO verification_documents (verificationId, filePath) VALUES ?', [docs]);
  console.log('3. Verification documents inserted');

  // ─── 4. Create / update investor wallet ─────────────────────────────────────
  await c.query(`
    INSERT INTO investor_wallets (user_id, balance, reserved, available, updated_at)
      VALUES (4, 50000.00, 12500.00, 37500.00, NOW())
    ON DUPLICATE KEY UPDATE
      balance   = 50000.00,
      reserved  = 12500.00,
      available = 37500.00,
      updated_at = NOW()
  `);
  console.log('4. Investor wallet created/updated  (50 000 PLN balance, 37 500 PLN available)');

  // ─── 5. Create loan requests from existing borrowers ────────────────────────
  const [lrRes] = await c.query(`
    INSERT INTO loan_requests
      (borrower_id, amount_requested, amount_funded, min_funding_threshold,
       funding_window_ends_at, auto_close, status, created_at, updated_at)
    VALUES
      (15, 500000, 500000, 300000, '2026-02-15 23:59:59', 1, 'FUNDED',  '2026-01-10 10:00:00', '2026-02-15 23:59:59'),
      (17, 800000, 800000, 500000, '2026-02-28 23:59:59', 1, 'FUNDED',  '2026-01-20 09:00:00', '2026-02-28 23:59:59'),
      (14, 300000,       0, 200000,'2026-03-31 23:59:59', 0, 'BIDDING', '2026-02-25 14:00:00', NOW()),
      (15, 600000, 250000, 400000, '2026-04-15 23:59:59', 1, 'BIDDING', '2026-02-28 11:00:00', NOW()),
      (17,1000000,       0, 700000,'2026-04-30 23:59:59', 0, 'OPEN',    '2026-03-01 08:00:00', NOW())
  `);
  const lr0 = Number(lrRes.insertId);
  console.log('5. Loan requests inserted (IDs', lr0, '-', lr0 + 4, ')');

  // ─── 6. Create marketplace bids from lender 4 ───────────────────────────────
  const bidRows = [
    [lr0,     4, 200000, 200000, 1, 'FILLED',           '2026-01-12 11:00:00', '2026-02-15 23:59:59'],
    [lr0 + 1, 4, 300000, 300000, 1, 'FILLED',           '2026-01-22 12:00:00', '2026-02-28 23:59:59'],
    [lr0 + 2, 4, 100000,      0, 0, 'ACTIVE',           '2026-02-26 10:00:00', '2026-02-26 10:00:00'],
    [lr0 + 3, 4, 250000, 250000, 1, 'PARTIALLY_FILLED', '2026-03-01 09:00:00', now],
  ];
  const [bidRes] = await c.query(
    `INSERT INTO marketplace_bids
       (loan_request_id, lender_id, bid_amount, allocated_amount, locked_funds, status, created_at, updated_at)
     VALUES ?`,
    [bidRows]
  );
  const bid0 = Number(bidRes.insertId);
  console.log('6. Marketplace bids inserted (IDs', bid0, '-', bid0 + 3, ')');

  // ─── 7. Create funding allocations for the completed bids ───────────────────
  const allocRows = [
    [lr0,     bid0,     4, 200000],
    [lr0 + 1, bid0 + 1, 4, 300000],
    [lr0 + 3, bid0 + 3, 4, 250000],
  ];
  await c.query(
    'INSERT INTO funding_allocations (loan_request_id, bid_id, lender_id, allocated_amount) VALUES ?',
    [allocRows]
  );
  console.log('7. Funding allocations inserted (3 allocations, total 750 000 gr = 7 500 PLN)');

  // ─── 8. Create funding pools ─────────────────────────────────────────────────
  await c.query(
    `INSERT INTO funding_pools (loan_request_id, total_pool_amount)
       VALUES (?, 500000), (?, 800000)
     ON DUPLICATE KEY UPDATE total_pool_amount = VALUES(total_pool_amount)`,
    [lr0, lr0 + 1]
  );
  console.log('8. Funding pools created for funded loan requests');

  // ─── 9. Create notifications for lender 4 ────────────────────────────────────
  const notifRows = [
    [4, 'VERIFICATION',  1, now, JSON.stringify({ message: 'Your identity (ID) verification has been approved.' })],
    [4, 'VERIFICATION',  1, now, JSON.stringify({ message: 'Your account is now fully verified. All trading features are unlocked.' })],
    [4, 'BID_FILLED',    0, now, JSON.stringify({ message: 'Your bid of 2 000 PLN on Loan Request #' + lr0 + ' has been fully filled.', loanRequestId: lr0 })],
    [4, 'BID_FILLED',    0, now, JSON.stringify({ message: 'Your bid of 3 000 PLN on Loan Request #' + (lr0 + 1) + ' has been fully filled.', loanRequestId: lr0 + 1 })],
    [4, 'REPAYMENT',     0, now, JSON.stringify({ message: 'A repayment has been received for Loan Request #' + lr0 + '.', amount: 210000 })],
    [4, 'BID_PLACED',    0, now, JSON.stringify({ message: 'Your bid of 1 000 PLN was placed on Loan Request #' + (lr0 + 2) + '.', loanRequestId: lr0 + 2 })],
    [4, 'WALLET_TOPUP',  1, now, JSON.stringify({ message: 'Wallet top-up of 50 000 PLN confirmed.' })],
  ];
  await c.query(
    'INSERT INTO notifications (user_id, type, `read`, createdAt, payload) VALUES ?',
    [notifRows]
  );
  console.log('9. Notifications inserted (7 notifications)');

  // ─── Summary ─────────────────────────────────────────────────────────────────
  const [uRow] = await c.query('SELECT id, email, level, first_name, last_name, phone, bank_account FROM users WHERE id=4');
  const [wRow] = await c.query('SELECT balance, reserved, available FROM investor_wallets WHERE user_id=4');
  const [vCount] = await c.query('SELECT count(*) as n FROM user_verifications WHERE user_id=4');
  const [bCount] = await c.query('SELECT count(*) as n FROM marketplace_bids WHERE lender_id=4');
  const [aCount] = await c.query('SELECT count(*) as n FROM funding_allocations WHERE lender_id=4');

  console.log('\n=== SEED COMPLETE ===');
  console.log('User:', JSON.stringify(uRow[0]));
  console.log('Wallet:', JSON.stringify(wRow[0]));
  console.log('Verifications:', vCount[0].n);
  console.log('Marketplace bids:', bCount[0].n);
  console.log('Funding allocations:', aCount[0].n);

  await c.end();
}

main().catch((err) => {
  console.error('SEED FAILED:', err.message);
  process.exit(1);
});
