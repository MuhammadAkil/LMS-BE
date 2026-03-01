/**
 * BORROWER TEST DATA SEED SCRIPT
 * Seeds all data needed to verify borrower flows from the test plan.
 *
 * What this script creates:
 *  1. level_rules  — defines loan limits per level (table was empty)  
 *  2. user_verifications  — verified docs for borrower@lms.com (user 3)
 *  3. repayments  — schedule for active loans 9, 14, 15 with mixed PAID/OVERDUE/PENDING
 *  4. contracts  — PDF records for REPAID loans 11, 17, 23
 *  5. notifications  — diverse types for user 3
 *  6. One OPEN loan application for user 3 (for cancel-flow tests)
 *  7. One REJECTED application for user 3
 *
 * Run: node f:/LMS/LMS-BE/scripts/seed-borrower-test-data.js
 *
 * DB: 209.182.238.150:3306  db=lending_platform  user=lms_user
 */

const mysql = require('f:/LMS/LMS-BE/node_modules/mysql2/promise');

const DB_CONFIG = {
  host: '209.182.238.150',
  port: 3306,
  user: 'lms_user',
  password: 'LmsPortal@786',
  database: 'lending_platform',
};

// Utility: date helpers
function addMonths(date, n) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + n);
  return d;
}
function toSqlDate(d) {
  return d.toISOString().slice(0, 10);
}
function toSqlDatetime(d) {
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

async function main() {
  console.log('Connecting to DB…');
  const conn = await mysql.createConnection(DB_CONFIG);
  console.log('Connected.\n');

  // ══════════════════════════════════════════════════════════════════════
  // 1. LEVEL RULES  (table is empty — critical for loan-limit endpoints)
  // ══════════════════════════════════════════════════════════════════════
  console.log('=== 1. Level Rules ===');
  const [existingLevels] = await conn.query('SELECT level FROM level_rules');
  if (existingLevels.length > 0) {
    console.log('  Level rules already exist, skipping.');
  } else {
    await conn.query(`
      INSERT INTO level_rules
        (level, maxLoanAmount, maxActiveLoans, maxApplications, commissionPercent, minAmount, minDuration, maxDuration, description)
      VALUES
        (0,  0,       0, 0, 5.00,  0,    0,   0,  'Unverified — cannot apply'),
        (1,  10000,   2, 5, 4.50,  500,  3,  12,  'Level E — basic verified'),
        (2,  30000,   3, 8, 4.00,  500,  3,  24,  'Level D — address verified'),
        (3,  60000,   5, 10, 3.50, 1000, 3,  36,  'Level C — income verified'),
        (4,  100000,  8, 15, 3.00, 1000, 3,  60,  'Level B — BIK check passed'),
        (5,  200000, 10, 20, 2.50, 1000, 3, 120,  'Level A — fully verified')
    `);
    console.log('  ✓ Inserted 6 level rules (levels 0–5).');
  }

  // ══════════════════════════════════════════════════════════════════════
  // 2. USER VERIFICATIONS for borrower@lms.com (user_id = 3)
  //    level=1 means ID verified; we add ID + EMAIL docs as APPROVED
  //    Also add INCOME as PENDING (shows "under review" scenario)
  // ══════════════════════════════════════════════════════════════════════
  console.log('\n=== 2. User Verifications (user 3) ===');
  const [existingVerifs] = await conn.query(
    'SELECT id FROM user_verifications WHERE user_id = 3'
  );
  if (existingVerifs.length > 0) {
    console.log(`  Already ${existingVerifs.length} verifications for user 3, skipping.`);
  } else {
    const now = toSqlDatetime(new Date());
    // status_id: 1=PENDING, 2=APPROVED, 3=REJECTED
    const verifs = [
      // ID — approved (grants level 1)
      [3, 1, 2, 2, now, now, null],
      // EMAIL — approved
      [3, 6, 2, 2, now, now, null],
      // ADDRESS — pending (user submitted, admin hasn't reviewed)
      [3, 2, 1, null, null, now, null],
      // INCOME — pending
      [3, 3, 1, null, null, now, null],
    ];
    for (const v of verifs) {
      await conn.query(
        `INSERT INTO user_verifications
           (user_id, verification_type_id, status_id, reviewed_by, reviewed_at, created_at, review_comment)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        v
      );
    }
    console.log(`  ✓ Inserted 4 verification records for user 3 (ID+EMAIL approved, ADDRESS+INCOME pending).`);

    // Add verification documents for the APPROVED ones
    const [vids] = await conn.query(
      'SELECT id, verification_type_id FROM user_verifications WHERE user_id = 3 AND status_id = 2'
    );
    for (const v of vids) {
      await conn.query(
        `INSERT INTO verification_documents (verificationId, filePath, uploadedAt)
         VALUES (?, ?, ?)`,
        [v.id, `/uploads/verifications/user3_type${v.verification_type_id}.pdf`, now]
      );
    }
    console.log(`  ✓ Inserted ${vids.length} verification documents.`);
  }

  // ══════════════════════════════════════════════════════════════════════
  // 3. REPAYMENTS for active loans 9, 14, 15 (statusId=2)
  //    Loan 9:  totalAmount=50000, 36 installments, interest=8%
  //    Loan 14: totalAmount=15000, 18 installments, interest=7.5%
  //    Loan 15: totalAmount=50000, 36 installments, interest=8%
  //    We back-date the loan start to ~Jan 2024 and generate:
  //      - Past instalments: some PAID on time, some PAID late, some OVERDUE (unpaid past due)
  //      - Future instalments: PENDING
  // ══════════════════════════════════════════════════════════════════════
  console.log('\n=== 3. Repayments ===');
  const [existingReps] = await conn.query(
    'SELECT COUNT(*) as n FROM repayments WHERE loanId IN (9, 14, 15)'
  );
  if (existingReps[0].n > 0) {
    console.log(`  ${existingReps[0].n} repayments already exist for loans 9/14/15, skipping.`);
  } else {
    // Loan 9: 36 months, start Jan 2024
    await seedRepayments(conn, 9, 50000, 36, 0.08, new Date('2024-01-15'));
    // Loan 14: 18 months, start Jul 2024
    await seedRepayments(conn, 14, 15000, 18, 0.075, new Date('2024-07-15'));
    // Loan 15: 36 months, start Oct 2024
    await seedRepayments(conn, 15, 50000, 36, 0.08, new Date('2024-10-15'));
    const [count] = await conn.query(
      'SELECT COUNT(*) as n FROM repayments WHERE loanId IN (9, 14, 15)'
    );
    console.log(`  ✓ Inserted ${count[0].n} repayment records.`);
  }

  // ══════════════════════════════════════════════════════════════════════
  // 4. CONTRACTS for REPAID loans 11, 17, 23
  //    pdfPath references a placeholder file path
  // ══════════════════════════════════════════════════════════════════════
  console.log('\n=== 4. Contracts ===');
  const [existingContracts] = await conn.query(
    'SELECT loanId FROM contracts WHERE loanId IN (11, 17, 23)'
  );
  const contractedLoans = new Set(existingContracts.map(r => Number(r.loanId)));
  const contractLoans = [11, 17, 23];
  let contractsAdded = 0;
  for (const loanId of contractLoans) {
    if (contractedLoans.has(loanId)) {
      console.log(`  Loan ${loanId} contract already exists, skipping.`);
      continue;
    }
    const generated = toSqlDatetime(new Date(`202${loanId === 11 ? 4 : loanId === 17 ? 4 : 5}-06-01`));
    await conn.query(
      `INSERT INTO contracts (loanId, pdfPath, generatedAt, createdAt)
       VALUES (?, ?, ?, ?)`,
      [loanId, `/uploads/contracts/loan_${loanId}_agreement.pdf`, generated, generated]
    );
    contractsAdded++;
  }
  console.log(`  ✓ Inserted ${contractsAdded} contracts (loans 11, 17, 23).`);

  // ══════════════════════════════════════════════════════════════════════
  // 5. NOTIFICATIONS for user 3 — varied types
  // ══════════════════════════════════════════════════════════════════════
  console.log('\n=== 5. Notifications ===');
  const notifTypes = [
    { type: 'APPLICATION_STATUS_CHANGED', read: 0, payload: { applicationId: 11, status: 'UNDER_REVIEW', message: 'Your application #11 is now under review.' } },
    { type: 'OFFER_RECEIVED',             read: 0, payload: { applicationId: 14, offerId: 1, amount: 50000, lenderName: 'InvestCorp', message: 'You received a loan offer for application #14.' } },
    { type: 'DISBURSEMENT_COMPLETED',     read: 1, payload: { loanId: 9, amount: 50000, message: 'Loan #9 (50,000 PLN) has been disbursed to your account.' } },
    { type: 'PAYMENT_DUE_REMINDER',       read: 0, payload: { loanId: 9, dueDate: toSqlDate(addMonths(new Date(), 7)), amount: 1565.30, message: 'Payment of 1,565.30 PLN for loan #9 is due soon.' } },
    { type: 'PAYMENT_OVERDUE',            read: 0, payload: { loanId: 14, daysOverdue: 10, amount: 922.20, message: 'Payment for loan #14 is 10 days overdue.' } },
    { type: 'LOAN_CLOSED',                read: 1, payload: { loanId: 11, message: 'Loan #11 has been fully repaid. Congratulations!' } },
    { type: 'VERIFICATION_APPROVED',      read: 1, payload: { verificationTypeCode: 'ID', message: 'Your identity verification has been approved.' } },
    { type: 'VERIFICATION_REJECTED',      read: 0, payload: { verificationTypeCode: 'INCOME', rejectionReason: 'Document illegible. Please re-upload.', message: 'Your income verification was rejected.' } },
    { type: 'PROFILE_UPDATED',            read: 1, payload: { message: 'Your profile has been updated successfully.' } },
    { type: 'APPLICATION_STATUS_CHANGED', read: 0, payload: { applicationId: 19, status: 'APPROVED', message: 'Your application #19 has been APPROVED! Waiting for funding.' } },
  ];

  let notifsAdded = 0;
  for (let i = 0; i < notifTypes.length; i++) {
    const n = notifTypes[i];
    const createdAt = toSqlDatetime(addMonths(new Date(), -(i * 2)));  // staggered over past months
    const readAt = n.read ? createdAt : null;
    await conn.query(
      `INSERT INTO notifications (user_id, type, \`read\`, createdAt, readAt, payload)
       VALUES (3, ?, ?, ?, ?, ?)`,
      [n.type, n.read, createdAt, readAt, JSON.stringify(n.payload)]
    );
    notifsAdded++;
  }
  console.log(`  ✓ Inserted ${notifsAdded} notifications for user 3 (mix of read/unread).`);

  // ══════════════════════════════════════════════════════════════════════
  // 6. APPLICATIONS — ensure user 3 has one OPEN (for cancel-flow)
  //    and one REJECTED (for history-flow)
  // ══════════════════════════════════════════════════════════════════════
  console.log('\n=== 6. Missing Application States ===');
  const [openApps] = await conn.query(
    'SELECT id FROM loan_applications WHERE borrowerId = 3 AND statusId = 1 LIMIT 1'
  );
  if (openApps.length > 0) {
    console.log(`  OPEN application already exists (id=${openApps[0].id}), skipping.`);
  } else {
    const [res] = await conn.query(
      `INSERT INTO loan_applications
         (amount, purpose, description, funded_amount, voluntary_commission, borrowerId, durationMonths, statusId, fundedPercent, createdAt, updatedAt, commission_status, repayment_type)
       VALUES (5000, 'Car repair', 'Need money to fix my car urgently', 0, 0, 3, 6, 1, 0, NOW(), NOW(), 'PENDING', 'ANNUITY')`,
    );
    console.log(`  ✓ Created OPEN application id=${res.insertId} (statusId=1) for cancel-flow testing.`);
  }

  const [rejectedApps] = await conn.query(
    'SELECT id FROM loan_applications WHERE borrowerId = 3 AND statusId = 4 LIMIT 1'
  );
  if (rejectedApps.length > 0) {
    console.log(`  REJECTED application already exists (id=${rejectedApps[0].id}), skipping.`);
  } else {
    const [res] = await conn.query(
      `INSERT INTO loan_applications
         (amount, purpose, description, funded_amount, voluntary_commission, borrowerId, durationMonths, statusId, fundedPercent, createdAt, updatedAt, commission_status, repayment_type)
       VALUES (25000, 'Business expansion', 'Expand my small business', 0, 0, 3, 24, 4, 0, DATE_SUB(NOW(), INTERVAL 30 DAY), NOW(), 'PENDING', 'ANNUITY')`,
    );
    console.log(`  ✓ Created REJECTED application id=${res.insertId} (statusId=4).`);
  }

  // ══════════════════════════════════════════════════════════════════════
  // 7. AUDIT LOGS — add a few specific ones for test visibility
  //    (user 3 already has 101 but they may be generic)
  // ══════════════════════════════════════════════════════════════════════
  console.log('\n=== 7. Audit Log Entries ===');
  const [recentAudits] = await conn.query(
    "SELECT id FROM audit_logs WHERE user_id=3 AND action='PROFILE_UPDATED' LIMIT 1"
  );
  if (recentAudits.length === 0) {
    const auditEntries = [
      ['PROFILE_UPDATED',           'User',             3,   '{}'],
      ['APPLICATION_CREATED',       'LoanApplication',  41,  '{"amount":5000}'],
      ['VERIFICATION_SUBMITTED',    'UserVerification', 1,   '{"type":"ID"}'],
      ['VERIFICATION_SUBMITTED',    'UserVerification', 2,   '{"type":"EMAIL"}'],
      ['LOAN_REPAYMENT_CONFIRMED',  'Repayment',        1,   '{"loanId":9,"amount":1565.30}'],
      ['DOCUMENT_DOWNLOADED',       'Contract',         1,   '{"loanId":11}'],
      ['PASSWORD_CHANGED',          'User',             3,   '{}'],
      ['NOTIFICATION_READ',         'Notification',     1,   '{}'],
    ];
    for (let i = 0; i < auditEntries.length; i++) {
      const [action, entity, entityId, meta] = auditEntries[i];
      const daysAgo = (auditEntries.length - i) * 3;
      await conn.query(
        `INSERT INTO audit_logs (user_id, action, entity, entity_id, metadata, ip, created_at)
         VALUES (3, ?, ?, ?, ?, '127.0.0.1', DATE_SUB(NOW(), INTERVAL ? DAY))`,
        [action, entity, entityId, meta, daysAgo]
      );
    }
    console.log(`  ✓ Inserted 8 targeted audit log entries for user 3.`);
  } else {
    console.log(`  Targeted audit entries already present, skipping.`);
  }

  // ── Summary ───────────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════════');
  console.log('SEED COMPLETE. Verification queries:');
  const [lr] = await conn.query('SELECT COUNT(*) as n FROM level_rules');
  const [uv] = await conn.query('SELECT COUNT(*) as n FROM user_verifications WHERE user_id=3');
  const [rp] = await conn.query('SELECT COUNT(*) as n FROM repayments WHERE loanId IN (9,14,15)');
  const [ct] = await conn.query('SELECT COUNT(*) as n FROM contracts WHERE loanId IN (11,17,23)');
  const [nt] = await conn.query('SELECT COUNT(*) as n FROM notifications WHERE user_id=3');
  const [al] = await conn.query('SELECT COUNT(*) as n FROM audit_logs WHERE user_id=3');
  const [ap1] = await conn.query('SELECT COUNT(*) as n FROM loan_applications WHERE borrowerId=3 AND statusId=1');
  const [ap4] = await conn.query('SELECT COUNT(*) as n FROM loan_applications WHERE borrowerId=3 AND statusId=4');
  console.log(`  level_rules rows        : ${lr[0].n}`);
  console.log(`  user_verifications(u=3) : ${uv[0].n}`);
  console.log(`  repayments(9,14,15)     : ${rp[0].n}`);
  console.log(`  contracts(11,17,23)     : ${ct[0].n}`);
  console.log(`  notifications(u=3)      : ${nt[0].n}`);
  console.log(`  audit_logs(u=3)         : ${al[0].n}`);
  console.log(`  OPEN apps(u=3)          : ${ap1[0].n}`);
  console.log(`  REJECTED apps(u=3)      : ${ap4[0].n}`);
  console.log('══════════════════════════════════════════════════');

  await conn.end();
  console.log('Done.');
}

/**
 * Generate annuity repayment schedule for a loan.
 * Marks past installments as PAID (on time) or PAID LATE or leaves unpaid (OVERDUE).
 */
async function seedRepayments(conn, loanId, principal, months, annualRate, startDate) {
  const monthlyRate = annualRate / 12;
  // Annuity installment amount
  const installment = +(
    (principal * monthlyRate * Math.pow(1 + monthlyRate, months)) /
    (Math.pow(1 + monthlyRate, months) - 1)
  ).toFixed(2);

  const today = new Date();
  const rows = [];

  for (let i = 1; i <= months; i++) {
    const dueDate = addMonths(startDate, i);
    const dueSql = toSqlDate(dueDate);

    let paidAt = null;
    const isPast = dueDate < today;
    const installmentIndex = i; // 1-based

    if (isPast) {
      if (installmentIndex <= 3) {
        // First 3: paid on time (1 day before due)
        const paid = new Date(dueDate);
        paid.setDate(paid.getDate() - 1);
        paidAt = toSqlDatetime(paid);
      } else if (installmentIndex === 4 || installmentIndex === 7) {
        // Installments 4 and 7: paid LATE (7–14 days after due) — tests delayedPaymentsCount
        const paid = new Date(dueDate);
        paid.setDate(paid.getDate() + (installmentIndex === 4 ? 7 : 14));
        paidAt = toSqlDatetime(paid);
      } else if (installmentIndex % 5 === 0) {
        // Every 5th: leave UNPAID → OVERDUE
        paidAt = null;
      } else {
        // Default: paid 2 days before due
        const paid = new Date(dueDate);
        paid.setDate(paid.getDate() - 2);
        paidAt = toSqlDatetime(paid);
      }
    }
    // Future installments: paidAt stays null (PENDING)

    rows.push([installment, loanId, dueSql, paidAt]);
  }

  for (const row of rows) {
    await conn.query(
      'INSERT INTO repayments (amount, loanId, dueDate, paidAt) VALUES (?, ?, ?, ?)',
      row
    );
  }
}

main().catch(err => {
  console.error('SEED FAILED:', err.message);
  console.error(err.stack);
  process.exit(1);
});
