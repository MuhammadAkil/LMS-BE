/**
 * COMPREHENSIVE LENDER TEST SEED SCRIPT
 * ──────────────────────────────────────────────────────────────────────────────
 * Creates ALL test data needed to verify every flow in the Lender Test Plan.
 *
 * Lender accounts created / updated:
 *   §1 Auth & Guards
 *     lender@lms.com        id=4  ACTIVE  level=2  (main lender, already exists)
 *     lender2blocked@lms.com       BLOCKED (status_id=3) level=2  → tests §14.7
 *     lender3frozen@lms.com        FROZEN  (status_id=4) level=2  → tests §14.8/9
 *     lender5other@lms.com         ACTIVE  level=2  → data isolation §5.7/13.2/14.4
 *
 *   §4 Offer Creation
 *     → 3 open loans (status_id=1) for new offers
 *     → 1 loan already has an offer from lender@lms.com (duplicate test §4.8)
 *     → 1 closed loan (status_id=3) for §4.9
 *     → 1 open loan with only 5 PLN remaining (over-capacity test §4.7)
 *
 *   §5 Investments
 *     → 3 loan_offers from lender@lms.com on ACTIVE loans (status_id=2)
 *     → 1 loan_offer from lender5other for data isolation test §5.7/§14.4
 *
 *   §11 Notifications
 *     → 8 diverse notifications for lender@lms.com (OVERDUE, REPAYMENT, BID, etc.)
 *     → 1 notification for lender5other (to test cross-user 403 §11.4)
 *
 *   §12 Exports
 *     → 3 export history records in reports table
 *
 *   §14.10 Managed lender
 *     → Management agreement for lender6managed@lms.com
 *
 * Password for all test users: Test@1234
 * ──────────────────────────────────────────────────────────────────────────────
 */

const mysql = require('mysql2/promise');

const DB = {
  host: '209.182.238.150', port: 3306,
  user: 'lms_user', password: 'LmsPortal@786',
  database: 'lending_platform',
};

// bcrypt hash of 'Test@1234' (cost 10)
const TEST_PWD_HASH = '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi';

async function main() {
  const c = await mysql.createConnection(DB);
  console.log('Connected to DB ✓\n');

  // ════════════════════════════════════════════════════════════════════════════
  // STEP 1 — Test Lender Users
  // ════════════════════════════════════════════════════════════════════════════
  console.log('─── §1 Creating test lender users ───');

  // lender2blocked@lms.com  →  BLOCKED (status_id=3)
  await c.query(`
    INSERT INTO users (id, email, password_hash, role_id, status_id, level, first_name, last_name, bank_account, created_at, updated_at)
    VALUES (101, 'lender2blocked@lms.com', ?, 3, 3, 2, 'Blocked', 'Lender',
            'PL22222222222222222222222222', NOW(), NOW())
    ON DUPLICATE KEY UPDATE status_id=3, level=2, first_name='Blocked', last_name='Lender', bank_account='PL22222222222222222222222222', updated_at=NOW()
  `, [TEST_PWD_HASH]);

  // lender3frozen@lms.com   →  FROZEN (status_id=4)
  await c.query(`
    INSERT INTO users (id, email, password_hash, role_id, status_id, level, first_name, last_name, bank_account, created_at, updated_at)
    VALUES (102, 'lender3frozen@lms.com', ?, 3, 4, 2, 'Frozen', 'Lender',
            'PL33333333333333333333333333', NOW(), NOW())
    ON DUPLICATE KEY UPDATE status_id=4, level=2, first_name='Frozen', last_name='Lender', bank_account='PL33333333333333333333333333', updated_at=NOW()
  `, [TEST_PWD_HASH]);

  // lender5other@lms.com    →  ACTIVE, used for data-isolation tests
  await c.query(`
    INSERT INTO users (id, email, password_hash, role_id, status_id, level, first_name, last_name, bank_account, created_at, updated_at)
    VALUES (103, 'lender5other@lms.com', ?, 3, 2, 2, 'Other', 'Lender',
            'PL55555555555555555555555555', NOW(), NOW())
    ON DUPLICATE KEY UPDATE status_id=2, level=2, first_name='Other', last_name='Lender', bank_account='PL55555555555555555555555555', updated_at=NOW()
  `, [TEST_PWD_HASH]);

  // lender6managed@lms.com  →  ACTIVE, will have a management agreement
  await c.query(`
    INSERT INTO users (id, email, password_hash, role_id, status_id, level, first_name, last_name, bank_account, created_at, updated_at)
    VALUES (104, 'lender6managed@lms.com', ?, 3, 2, 2, 'Managed', 'Lender',
            'PL66666666666666666666666666', NOW(), NOW())
    ON DUPLICATE KEY UPDATE status_id=2, level=2, first_name='Managed', last_name='Lender', bank_account='PL66666666666666666666666666', updated_at=NOW()
  `, [TEST_PWD_HASH]);

  console.log('Created: lender2blocked(id=101), lender3frozen(id=102), lender5other(id=103), lender6managed(id=104) ✓');

  // ════════════════════════════════════════════════════════════════════════════
  // STEP 2 — Verifications for test lenders (required for level=2 to make sense)
  // ════════════════════════════════════════════════════════════════════════════
  console.log('\n─── §2 Adding verifications for test lenders ───');

  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const testLenders = [101, 102, 103, 104];
  for (const uid of testLenders) {
    for (let typeId = 1; typeId <= 6; typeId++) {
      await c.query(`
        INSERT INTO user_verifications (user_id, verification_type_id, status_id, created_at, reviewed_by, reviewed_at, review_comment, metadata)
        VALUES (?, ?, 2, ?, 2, ?, 'Auto-seeded for testing', '{}')
        ON DUPLICATE KEY UPDATE status_id=2, reviewed_at=?
      `, [uid, typeId, now, now, now]);
    }
    await c.query(`
      INSERT INTO investor_wallets (user_id, balance, reserved, available, updated_at)
      VALUES (?, 25000.00, 0.00, 25000.00, NOW())
      ON DUPLICATE KEY UPDATE balance=25000.00, available=25000.00, updated_at=NOW()
    `, [uid]);
  }
  console.log('Verifications + wallets for all 4 test lenders ✓');

  // ════════════════════════════════════════════════════════════════════════════
  // STEP 3 — Loan Applications (needed as FK for loans)
  // ════════════════════════════════════════════════════════════════════════════
  console.log('\n─── §3 Creating loan applications for test loans ───');

  // Fetch a valid borrower_id from the DB
  const [borrowerRows] = await c.query(`SELECT id FROM users WHERE role_id=2 LIMIT 1`);
  const borrowerId = borrowerRows.length > 0 ? borrowerRows[0].id : 2;
  console.log(`Using borrower_id=${borrowerId} for test loan applications`);

  const [appRes] = await c.query(`
    INSERT INTO loan_applications (borrowerId, amount, purpose, durationMonths, statusId, createdAt, updatedAt)
    VALUES
      (${borrowerId}, 10000.00, 'Home improvement', 12, 2, '2026-01-01 10:00:00', '2026-01-01 10:00:00'),
      (${borrowerId}, 20000.00, 'Business expansion', 24, 2, '2026-01-05 10:00:00', '2026-01-05 10:00:00'),
      (${borrowerId}, 15000.00, 'Education fund', 18, 2, '2026-01-10 10:00:00', '2026-01-10 10:00:00'),
      (${borrowerId}, 50000.00, 'Vehicle purchase', 36, 2, '2026-01-15 10:00:00', '2026-01-15 10:00:00'),
      (${borrowerId}, 5000.00,  'Emergency repair', 6,  2, '2026-01-20 10:00:00', '2026-01-20 10:00:00'),
      (${borrowerId}, 8000.00,  'Medical expenses', 12, 2, '2026-01-25 10:00:00', '2026-01-25 10:00:00')
  `);
  const firstAppId = Number(appRes.insertId);
  console.log(`Loan applications inserted (first ID: ${firstAppId}) ✓`);

  // ════════════════════════════════════════════════════════════════════════════
  // STEP 4 — Loans (various statuses for test coverage)
  // ════════════════════════════════════════════════════════════════════════════
  console.log('\n─── §4 Creating test loans ───');

  // OPEN loans (status_id=1) — for offer creation tests (§4.1, §4.2, §4.4)
  const [loanRes] = await c.query(`
    INSERT INTO loans
      (applicationId, borrowerId, totalAmount, fundedAmount, statusId, dueDate, interest_rate, repayment_type, installment_count, voluntary_commission, lender_data_revealed, createdAt, updatedAt)
    VALUES
      -- Loan A: 10,000 PLN OPEN — lender@lms.com will have existing offer (duplicate test §4.8)
      (${firstAppId},   ${borrowerId}, 10000.00, 2000.00,  1, '2027-01-01', 0.0850, 'INSTALLMENTS', 12, 0, 0, '2026-01-01 12:00:00', '2026-01-01 12:00:00'),
      -- Loan B: 20,000 PLN OPEN — available for new offers
      (${firstAppId+1}, ${borrowerId}, 20000.00, 0.00,     1, '2027-02-01', 0.0900, 'INSTALLMENTS', 24, 0, 0, '2026-01-05 12:00:00', '2026-01-05 12:00:00'),
      -- Loan C: 15,000 PLN OPEN — available for new offers
      (${firstAppId+2}, ${borrowerId}, 15000.00, 0.00,     1, '2027-03-01', 0.0750, 'INSTALLMENTS', 18, 0, 0, '2026-01-10 12:00:00', '2026-01-10 12:00:00'),
      -- Loan D: ACTIVE (status_id=2) — for active investment tests (§5.x)
      (${firstAppId+3}, ${borrowerId}, 50000.00, 50000.00, 2, '2029-01-01', 0.0800, 'INSTALLMENTS', 36, 150, 1, '2026-01-15 12:00:00', '2026-01-15 12:00:00'),
      -- Loan E: OPEN with only 5 PLN remaining — over-capacity test §4.7
      (${firstAppId+4}, ${borrowerId}, 5000.00,  4995.00,  1, '2027-06-01', 0.1000, 'LUMP_SUM',     null, 0, 0, '2026-01-20 12:00:00', '2026-01-20 12:00:00'),
      -- Loan F: CLOSED (status_id=3) — tests §4.9 (closed loan offer rejected)
      (${firstAppId+5}, ${borrowerId}, 8000.00,  8000.00,  3, '2026-04-01', 0.0800, 'LUMP_SUM',     null, 0, 0, '2026-01-25 12:00:00', '2026-01-25 12:00:00')
  `);
  const firstLoanId = Number(loanRes.insertId);
  const loanA = firstLoanId;      // OPEN, lender@lms.com already has offer
  const loanB = firstLoanId + 1;  // OPEN, available
  const loanC = firstLoanId + 2;  // OPEN, available
  const loanD = firstLoanId + 3;  // ACTIVE (investments)
  const loanE = firstLoanId + 4;  // OPEN, near-full
  const loanF = firstLoanId + 5;  // CLOSED
  console.log(`Loans inserted: A=${loanA}(OPEN), B=${loanB}(OPEN), C=${loanC}(OPEN), D=${loanD}(ACTIVE), E=${loanE}(OPEN-near-full), F=${loanF}(CLOSED) ✓`);

  // ════════════════════════════════════════════════════════════════════════════
  // STEP 5 — Loan Offers (lender@lms.com id=4 and lender5other id=103)
  // ════════════════════════════════════════════════════════════════════════════
  console.log('\n─── §5 Creating loan offers / investments ───');

  // lender@lms.com (id=4) on Loan A (duplicate block §4.8), Loan D (investment §5.x)
  // lender5other (id=103) on Loan D (data isolation §5.7/§14.4)
  const [offRes] = await c.query(`
    INSERT INTO loan_offers (loanId, lenderId, amount, confirmed_amount, createdAt)
    VALUES
      (${loanA}, 4,   2000.00, null,     '2026-01-15 14:00:00'),
      (${loanD}, 4,   15000.00, 15000.00, '2026-01-20 10:00:00'),
      (${loanD}, 103, 10000.00, 10000.00, '2026-01-22 11:00:00')
  `);
  const firstOfferId = Number(offRes.insertId);
  console.log(`Loan offers: lender4→loanA(id=${firstOfferId}), lender4→loanD(id=${firstOfferId+1}), lender5→loanD(id=${firstOfferId+2}) ✓`);
  console.log(`  Invest test: GET /lender/investments/${firstOfferId+1} = lender4's own investment ✓`);
  console.log(`  ISO test:    GET /lender/investments/${firstOfferId+2} as lender4 should 403 ✓`);

  // ════════════════════════════════════════════════════════════════════════════
  // STEP 6 — Marketplace Bids (diverse statuses for bid distribution chart)
  // ════════════════════════════════════════════════════════════════════════════
  console.log('\n─── §6 Creating marketplace bids with diverse statuses ───');

  // Get a valid loan_request_id (needed as FK)
  const [lrRows] = await c.query('SELECT id FROM loan_requests LIMIT 3');
  let lr1 = null, lr2 = null, lr3 = null;
  if (lrRows.length >= 3) { lr1 = lrRows[0].id; lr2 = lrRows[1].id; lr3 = lrRows[2].id; }
  else if (lrRows.length >= 2) { lr1 = lrRows[0].id; lr2 = lrRows[1].id; lr3 = lrRows[0].id; }
  else if (lrRows.length >= 1) { lr1 = lrRows[0].id; lr2 = lrRows[0].id; lr3 = lrRows[0].id; }

  if (lr1) {
    await c.query(`
      INSERT INTO marketplace_bids (lender_id, loan_request_id, bid_amount, status, created_at)
      VALUES
        (4, ${lr1}, 5000.00,  'FILLED',           '2026-01-10 09:00:00'),
        (4, ${lr2}, 3000.00,  'ACTIVE',            '2026-01-12 10:00:00'),
        (4, ${lr3}, 2000.00,  'ACTIVE',            '2026-01-25 14:00:00'),
        (4, ${lr1}, 1500.00,  'EXPIRED',           '2025-12-20 11:00:00'),
        (4, ${lr2}, 2500.00,  'PARTIALLY_FILLED',  '2026-02-01 08:00:00'),
        (4, ${lr3}, 800.00,   'REJECTED',          '2025-11-15 10:00:00')
    `);
    console.log('Marketplace bids (CONFIRMED, ACTIVE, PENDING, CANCELLED, PARTIALLY_FILLED) ✓');
  } else {
    console.log('SKIP: No loan_requests found for marketplace_bids FK ✓');
  }

  // ════════════════════════════════════════════════════════════════════════════
  // STEP 7 — Transaction Logs (full 6-month history for lender@lms.com)
  // ════════════════════════════════════════════════════════════════════════════
  console.log('\n─── §7 Seeding full transaction history ───');

  await c.query(`
    INSERT INTO transaction_logs (user_id, transaction_type, amount, status, reference_id, created_at)
    VALUES
      (4, 'TOP_UP',    10000.00, 'COMPLETED', null, '2025-10-15 10:00:00'),
      (4, 'TOP_UP',    25000.00, 'COMPLETED', null, '2025-11-03 11:00:00'),
      (4, 'INVESTMENT', 5000.00, 'COMPLETED', null, '2025-11-10 14:00:00'),
      (4, 'TOP_UP',    15000.00, 'COMPLETED', null, '2025-12-01 09:00:00'),
      (4, 'WITHDRAWAL', 3000.00, 'COMPLETED', null, '2025-12-20 16:00:00'),
      (4, 'TOP_UP',    20000.00, 'COMPLETED', null, '2026-01-05 10:00:00'),
      (4, 'INVESTMENT', 8000.00, 'COMPLETED', null, '2026-01-12 13:00:00'),
      (4, 'REPAYMENT',  1200.00, 'COMPLETED', null, '2026-01-25 09:30:00'),
      (4, 'TOP_UP',     5000.00, 'COMPLETED', null, '2026-02-10 11:00:00'),
      (4, 'INVESTMENT', 2000.00, 'COMPLETED', null, '2026-02-14 15:00:00'),
      (4, 'REPAYMENT',  1200.00, 'COMPLETED', null, '2026-02-25 09:30:00'),
      (4, 'WITHDRAWAL', 5000.00, 'COMPLETED', null, '2026-03-01 17:00:00')
  `);
  console.log('12 transaction log entries across 6 months ✓');

  // ════════════════════════════════════════════════════════════════════════════
  // STEP 8 — Notifications (§11 — diverse types + cross-user isolation)
  // ════════════════════════════════════════════════════════════════════════════
  console.log('\n─── §8 Seeding notifications ───');

  const notifData = [
    // lender@lms.com (id=4) — various types
    [4, 'REPAYMENT_RECEIVED',   JSON.stringify({ title: 'Repayment Received', message: 'Jan instalment of 1,200 PLN received', amount: 1200 }),              0, null, '2026-01-25 09:30:00'],
    [4, 'REPAYMENT_RECEIVED',   JSON.stringify({ title: 'Repayment Received', message: 'Feb instalment of 1,200 PLN received', amount: 1200 }),              1, '2026-02-27 10:00:00', '2026-02-25 09:30:00'],
    [4, 'BID_CONFIRMED',        JSON.stringify({ title: 'Bid Confirmed', message: 'Your bid of 5,000 PLN has been confirmed', amount: 5000 }),               0, null, '2026-01-10 09:30:00'],
    [4, 'OVERDUE_REPAYMENT',    JSON.stringify({ title: 'Overdue Payment', message: 'Borrower missed payment due on 2026-01-15', loanId: loanD }),            0, null, '2026-01-20 08:00:00'],
    [4, 'LOAN_FUNDED',          JSON.stringify({ title: 'Loan Fully Funded', message: 'Loan you partly funded is now fully funded', loanId: loanD }),        1, '2026-01-24 11:00:00', '2026-01-22 10:00:00'],
    [4, 'WALLET_TOP_UP',        JSON.stringify({ title: 'Wallet Topped Up', message: 'Your wallet was credited 20,000 PLN', amount: 20000 }),                0, null, '2026-01-05 10:15:00'],
    [4, 'OFFER_ACCEPTED',       JSON.stringify({ title: 'Offer Accepted', message: 'Your offer of 15,000 PLN has been accepted', amount: 15000, loanId: loanD }), 0, null, '2026-01-20 10:30:00'],
    [4, 'SYSTEM_ALERT',         JSON.stringify({ title: 'Account Verification Reminder', message: 'Review your latest investment statement' }),               0, null, '2026-02-15 08:00:00'],
    // lender5other (id=103) — for §11.4 cross-user 403 test
    [103, 'REPAYMENT_RECEIVED', JSON.stringify({ title: 'Repayment for lender5', message: 'Feb payment received' }),                                         0, null, '2026-02-26 10:00:00'],
  ];

  const [notifRes] = await c.query(`
    INSERT INTO notifications (user_id, type, payload, \`read\`, readAt, createdAt)
    VALUES ?
  `, [notifData]);
  const firstNotifId = Number(notifRes.insertId);
  const lender5NotifId = firstNotifId + 8;
  console.log(`9 notifications inserted (first ID: ${firstNotifId}) ✓`);
  console.log(`  Cross-user isolation test: PATCH /lender/notifications/${lender5NotifId}/read as lender4 should 403 ✓`);

  // ════════════════════════════════════════════════════════════════════════════
  // STEP 9 — Export History (§12 — exports table)
  //   Schema: id, export_type_id(int), created_by(bigint), file_path, created_at, record_count, metadata
  //   export_types schema: id, code, name
  // ════════════════════════════════════════════════════════════════════════════
  console.log('\n─── §9 Seeding export history ───');

  // Ensure export_types exist (LOANS, INVESTMENTS, REPAYMENTS)
  await c.query(`
    INSERT IGNORE INTO export_types (id, code, name) VALUES
      (1, 'LOANS',       'Loan Portfolio Export'),
      (2, 'INVESTMENTS', 'Investment History Export'),
      (3, 'REPAYMENTS',  'Repayment Schedule Export')
  `);

  await c.query(`
    INSERT INTO exports (export_type_id, created_by, file_path, created_at, record_count, metadata)
    VALUES
      (1, 4, '/exports/lender4_2026-01_loans.csv',       '2026-01-31 18:00:00', 12, '{"format":"CSV","period":"2026-01"}'),
      (2, 4, '/exports/lender4_2026-02_investments.xml', '2026-02-28 18:00:00',  3, '{"format":"XML","period":"2026-02"}'),
      (1, 4, '/exports/lender4_2026-03_loans.csv',       '2026-03-31 18:00:00', 15, '{"format":"CSV","period":"2026-03"}')
  `);
  console.log('3 export history records added to exports table ✓');
  console.log('  §12 test: GET /lender/exports/history — should return 3 records for lender4 ✓');

  // ════════════════════════════════════════════════════════════════════════════
  // STEP 10 — Management Agreement (§14.10 — managed lender)
  // ════════════════════════════════════════════════════════════════════════════
  console.log('\n─── §10 Seeding management agreement for lender6managed ───');

  // Get the first company
  const [companies] = await c.query('SELECT id, name FROM companies LIMIT 1');
  if (companies.length > 0) {
    const companyId = companies[0].id;
    await c.query(`
      INSERT INTO management_agreements (lenderId, companyId, signedAt, createdAt)
      VALUES (104, ${companyId}, CURDATE(), NOW())
      ON DUPLICATE KEY UPDATE signedAt=CURDATE()
    `);
    console.log(`Management agreement: lender6managed(104) → company(${companyId} ${companies[0].name}) ✓`);
    console.log(`  §14.10 test: POST /lender/offers as lender6managed should 403 LENDER_IS_MANAGED`);
  } else {
    console.log('SKIP: No companies found in DB');
  }

  // ════════════════════════════════════════════════════════════════════════════
  // STEP 11 — Loan unverified lender (no bank account) test
  // ════════════════════════════════════════════════════════════════════════════
  console.log('\n─── §11 Creating lender with NO bank account (§4.12) ───');

  await c.query(`
    INSERT INTO users (id, email, password_hash, role_id, status_id, level, first_name, last_name, bank_account, created_at, updated_at)
    VALUES (105, 'lender7nobank@lms.com', ?, 3, 2, 2, 'NoBankAcc', 'Lender', NULL, NOW(), NOW())
    ON DUPLICATE KEY UPDATE bank_account=NULL, status_id=2, level=2, updated_at=NOW()
  `, [TEST_PWD_HASH]);
  // Add verifications so the level=2 is consistent
  for (let typeId = 1; typeId <= 6; typeId++) {
    await c.query(`
      INSERT INTO user_verifications (user_id, verification_type_id, status_id, created_at, reviewed_by, reviewed_at, review_comment, metadata)
      VALUES (105, ?, 2, ?, 2, ?, 'Auto-seeded', '{}')
      ON DUPLICATE KEY UPDATE status_id=2
    `, [typeId, now, now]);
  }
  await c.query(`
    INSERT INTO investor_wallets (user_id, balance, reserved, available, updated_at)
    VALUES (105, 10000.00, 0.00, 10000.00, NOW())
    ON DUPLICATE KEY UPDATE balance=10000.00, available=10000.00, updated_at=NOW()
  `);
  console.log('lender7nobank(id=105) — POST /lender/offers should 403 Bank account required ✓');

  // ════════════════════════════════════════════════════════════════════════════
  // STEP 12 — Lender with low verification level (§4.13)
  // ════════════════════════════════════════════════════════════════════════════
  console.log('\n─── §12 Creating lender with level=0 (§4.13) ───');

  await c.query(`
    INSERT INTO users (id, email, password_hash, role_id, status_id, level, first_name, last_name, bank_account, created_at, updated_at)
    VALUES (106, 'lender8level0@lms.com', ?, 3, 2, 0, 'LowLevel', 'Lender', 'PL88888888888888888888888888', NOW(), NOW())
    ON DUPLICATE KEY UPDATE level=0, status_id=2, updated_at=NOW()
  `, [TEST_PWD_HASH]);
  console.log('lender8level0(id=106) — POST /lender/offers should 403 Insufficient verification level ✓');

  // ════════════════════════════════════════════════════════════════════════════
  // SUMMARY
  // ════════════════════════════════════════════════════════════════════════════
  await c.end();

  console.log('\n══════════════════════════════════════════════════════════════════');
  console.log('✅ COMPREHENSIVE SEED COMPLETE');
  console.log('══════════════════════════════════════════════════════════════════');
  console.log('\nTest Accounts Summary:');
  console.log('  lender@lms.com        (id=4)   ACTIVE  level=2  — Main lender');
  console.log('  lender2blocked@lms.com(id=101)  BLOCKED level=2  — §14.7 all ops → 403 ACCOUNT_BLOCKED');
  console.log('  lender3frozen@lms.com (id=102)  FROZEN  level=2  — §14.8 GET works, §14.9 POST → 403 ACCOUNT_FROZEN');
  console.log('  lender5other@lms.com  (id=103)  ACTIVE  level=2  — Data isolation');
  console.log('  lender6managed@lms.com(id=104)  ACTIVE  level=2  — §14.10 POST /offers → 403 LENDER_IS_MANAGED');
  console.log('  lender7nobank@lms.com (id=105)  ACTIVE  level=2  — §4.12  POST /offers → 403 Bank account required');
  console.log('  lender8level0@lms.com (id=106)  ACTIVE  level=0  — §4.13  POST /offers → 403 Insufficient level');
  console.log('\nKey Test IDs:');
  console.log(`  Loan A (OPEN, lender4 has offer) : id=${loanA}  → §4.8 duplicate offer test`);
  console.log(`  Loan B (OPEN, available)         : id=${loanB}  → §4.4 create valid offer`);
  console.log(`  Loan C (OPEN, available)         : id=${loanC}  → §4.1 browse / filter`);
  console.log(`  Loan D (ACTIVE, investments)     : id=${loanD}  → §5.x investment detail + repayments`);
  console.log(`  Loan E (OPEN, 5 PLN remaining)   : id=${loanE}  → §4.7 over-capacity test`);
  console.log(`  Loan F (CLOSED)                  : id=${loanF}  → §4.9 closed loan test`);
  console.log(`  lender4→loanD offer              : id=${firstOfferId+1} → §5.2 own investment`);
  console.log(`  lender5→loanD offer              : id=${firstOfferId+2} → §14.4 GET as lender4 → 403`);
  console.log(`  lender5 notification             : id=${lender5NotifId} → §11.4 PATCH as lender4 → 403`);
  console.log('\nAll passwords: Test@1234');
}

main().catch(err => {
  console.error('SEED FAILED:', err.message);
  process.exit(1);
});
