/**
 * ADMIN FLOW SEED SCRIPT  v2
 * Populates ALL admin screens and popups with realistic dummy data.
 *
 * Run: node scripts/seed-admin-test-data.js
 */

'use strict';

const mysql = require('mysql2/promise');

const DB = {
  host: '209.182.238.150',
  port: 3306,
  user: 'lms_user',
  password: 'LmsPortal@786',
  database: 'lending_platform',
};

/* ─── reference IDs already in DB ───────────────────────────────────────── */
const ADMIN_ID     = 2;   // admin@lms.com
const SUPER_ID     = 6;   // superadmin@lms.com
const BORROWER_ID  = 3;   // borrower@lms.com
const LENDER_ID    = 4;   // lender@lms.com
const COMPANY_1    = 1;   // existing company
const COMPANY_2    = 2;   // existing company

// bcrypt hash for "Admin@123"
const PWD = '$2b$10$hoyFj/ya3DDn.ALOO8tVG.6gFFj7h/CcK5EDcTSmqwJNAfvNZnc02';

/* ─── helpers ────────────────────────────────────────────────────────────── */
function daysAgo(n)  { const d = new Date(); d.setDate(d.getDate() - n); return d; }
function daysAhead(n){ const d = new Date(); d.setDate(d.getDate() + n); return d; }
function fmt(d)      { return d.toISOString().slice(0, 19).replace('T', ' '); }
function rnd(min, max){ return Math.floor(Math.random() * (max - min + 1)) + min; }

let inserted = 0;
let skipped  = 0;

async function ins(db, table, row) {
  try {
    const cols = Object.keys(row).map(c => `\`${c}\``).join(', ');
    const vals = Object.values(row);
    const ph   = vals.map(() => '?').join(', ');
    await db.query(`INSERT INTO \`${table}\` (${cols}) VALUES (${ph})`, vals);
    inserted++;
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') { skipped++; }
    else { console.error(`  ✗ ${table}: ${e.message.split('\n')[0]}`); }
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN
═══════════════════════════════════════════════════════════════════════════ */
async function main() {
  const db = await mysql.createConnection(DB);
  console.log('✔ Connected to DB\n');

  // ── 1. EXTRA USERS ──────────────────────────────────────────────────────
  console.log('── 1. Users');
  const extraBorrowers = [
    { id: 200, email: 'pending.borrower1@lms.com', first_name: 'Kamil',    last_name: 'Bąk',       role_id: 2, status_id: 1, level: 0, phone: '+48511200001', pesel: '96041223456', address: 'ul. Kasztanowa 3, 00-200 Warsaw' },
    { id: 201, email: 'pending.borrower2@lms.com', first_name: 'Natalia',  last_name: 'Szymańska', role_id: 2, status_id: 1, level: 0, phone: '+48511200002', pesel: '93111334567', address: 'ul. Wiśniowa 8, 30-046 Kraków' },
    { id: 202, email: 'blocked.borrower@lms.com',  first_name: 'Ryszard',  last_name: 'Kowal',     role_id: 2, status_id: 3, level: 1, phone: '+48511200003', pesel: '78091445678', address: 'ul. Topolowa 14, 50-100 Wrocław' },
    { id: 203, email: 'frozen.borrower@lms.com',   first_name: 'Halina',   last_name: 'Michalska', role_id: 2, status_id: 4, level: 2, phone: '+48511200004', pesel: '82061556789', address: 'ul. Dębowa 2, 61-100 Poznań' },
    { id: 204, email: 'verified.borrower@lms.com', first_name: 'Grzegorz', last_name: 'Pawlak',    role_id: 2, status_id: 2, level: 3, phone: '+48511200005', pesel: '71030167890', address: 'ul. Bukowa 7, 80-200 Gdańsk' },
    { id: 205, email: 'defaulted.borrower@lms.com',first_name: 'Dorota',   last_name: 'Jabłońska', role_id: 2, status_id: 2, level: 1, phone: '+48511200006', pesel: '88052278901', address: 'ul. Jodłowa 21, 90-400 Łódź' },
  ];
  for (const u of extraBorrowers) {
    await ins(db, 'users', { ...u, password_hash: PWD, is_super_admin: 0,
      created_at: fmt(daysAgo(rnd(30, 180))), updated_at: fmt(daysAgo(rnd(1, 29))) });
  }
  const extraLenders = [
    { id: 210, email: 'lender.pending1@lms.com', first_name: 'Bartosz', last_name: 'Ostrowski', role_id: 3, status_id: 1, level: 0, phone: '+48621300001', bank_account: 'PL10200000001111111111111111' },
    { id: 211, email: 'lender.pending2@lms.com', first_name: 'Sylwia',  last_name: 'Kozłowska', role_id: 3, status_id: 1, level: 1, phone: '+48621300002', bank_account: 'PL10200000002222222222222222' },
    { id: 212, email: 'lender.verified@lms.com', first_name: 'Andrzej', last_name: 'Bednarek',  role_id: 3, status_id: 2, level: 2, phone: '+48621300003', bank_account: 'PL10200000003333333333333333' },
    { id: 213, email: 'lender.blocked2@lms.com', first_name: 'Renata',  last_name: 'Grabowska', role_id: 3, status_id: 3, level: 1, phone: '+48621300004', bank_account: 'PL10200000004444444444444444' },
  ];
  for (const u of extraLenders) {
    await ins(db, 'users', { ...u, password_hash: PWD, is_super_admin: 0,
      created_at: fmt(daysAgo(rnd(20, 120))), updated_at: fmt(daysAgo(rnd(1, 19))) });
  }
  await ins(db, 'users', { id: 220, email: 'company3@test.com', first_name: 'Łukasz', last_name: 'Nowacki',
    role_id: 4, status_id: 1, level: 0, phone: '+48731400001', company_id: 3,
    password_hash: PWD, is_super_admin: 0, created_at: fmt(daysAgo(60)), updated_at: fmt(daysAgo(5)) });
  console.log('   done');

  // ── 2. COMPANIES ─────────────────────────────────────────────────────────
  // companies: id, name, status_id, commission_pct, min_managed_amount, created_at, updated_at
  console.log('── 2. Companies');
  const companies = [
    { id: 3, name: 'Inwestycje Polska Sp. z o.o.', status_id: 1, commission_pct: 0.00, min_managed_amount: 0.00 },
    { id: 4, name: 'Capital Partners S.A.',        status_id: 2, commission_pct: 1.50, min_managed_amount: 5000.00 },
  ];
  for (const c of companies) {
    await ins(db, 'companies', { ...c, created_at: fmt(daysAgo(90)), updated_at: fmt(daysAgo(10)) });
  }
  console.log('   done');

  // ── 3. MANAGEMENT AGREEMENTS ─────────────────────────────────────────────
  // management_agreements: id, amount, lenderId, companyId, signedAt, createdAt, terminated_at
  console.log('── 3. Management agreements');
  const mgmtAgreements = [
    { id: 10, lenderId: LENDER_ID, companyId: COMPANY_1, amount: 10000.00, signedAt: fmt(daysAgo(60)) },
    { id: 11, lenderId: 20,         companyId: COMPANY_1, amount:  5000.00, signedAt: fmt(daysAgo(45)) },
    { id: 12, lenderId: 21,         companyId: COMPANY_2, amount:  8000.00, signedAt: fmt(daysAgo(30)) },
    { id: 13, lenderId: 22,         companyId: COMPANY_2, amount:  3000.00, signedAt: null              },
    { id: 14, lenderId: 212,        companyId: 3,          amount: 20000.00, signedAt: fmt(daysAgo(10)) },
    { id: 15, lenderId: 210,        companyId: 3,          amount:  6000.00, signedAt: null              },
  ];
  for (const a of mgmtAgreements) {
    await ins(db, 'management_agreements', { id: a.id, lenderId: a.lenderId, companyId: a.companyId,
      amount: a.amount, signedAt: a.signedAt, createdAt: fmt(daysAgo(rnd(10, 80))) });
  }
  console.log('   done');

  // ── 4. COMPANY LENDERS ───────────────────────────────────────────────────
  // company_lenders: id, active, companyId, lenderId, amountLimit, createdAt, updatedAt
  console.log('── 4. Company lenders');
  const companyLenders = [
    { id: 10, companyId: COMPANY_1, lenderId: LENDER_ID, active: 1, amountLimit: 50000 },
    { id: 11, companyId: COMPANY_1, lenderId: 20,          active: 1, amountLimit: 30000 },
    { id: 12, companyId: COMPANY_1, lenderId: 21,          active: 1, amountLimit: 20000 },
    { id: 13, companyId: COMPANY_2, lenderId: 22,          active: 1, amountLimit: 40000 },
    { id: 14, companyId: COMPANY_2, lenderId: 103,         active: 0, amountLimit: 10000 },
    { id: 15, companyId: 3,          lenderId: 212,        active: 1, amountLimit: 80000 },
  ];
  for (const cl of companyLenders) {
    await ins(db, 'company_lenders', { id: cl.id, companyId: cl.companyId, lenderId: cl.lenderId,
      active: cl.active, amountLimit: cl.amountLimit,
      createdAt: fmt(daysAgo(rnd(10, 60))), updatedAt: fmt(daysAgo(rnd(0, 9))) });
  }
  console.log('   done');

  // ── 5. USER VERIFICATIONS (pending queue) ────────────────────────────────
  // user_verifications: id, user_id, verification_type_id, status_id,
  //                     reviewed_by, reviewed_at, created_at, review_comment, metadata
  console.log('── 5. User verifications');
  const verifs = [
    { id: 300, user_id: 200, verification_type_id: 1, status_id: 1, reviewed_by: null,     reviewed_at: null,             review_comment: null },
    { id: 301, user_id: 200, verification_type_id: 5, status_id: 1, reviewed_by: null,     reviewed_at: null,             review_comment: null },
    { id: 302, user_id: 201, verification_type_id: 1, status_id: 1, reviewed_by: null,     reviewed_at: null,             review_comment: null },
    { id: 303, user_id: 201, verification_type_id: 2, status_id: 1, reviewed_by: null,     reviewed_at: null,             review_comment: null },
    { id: 304, user_id: 201, verification_type_id: 3, status_id: 1, reviewed_by: null,     reviewed_at: null,             review_comment: null },
    { id: 305, user_id: 204, verification_type_id: 1, status_id: 2, reviewed_by: ADMIN_ID, reviewed_at: fmt(daysAgo(10)), review_comment: 'Verified document OK' },
    { id: 306, user_id: 204, verification_type_id: 2, status_id: 2, reviewed_by: ADMIN_ID, reviewed_at: fmt(daysAgo(10)), review_comment: 'Address confirmed via letter' },
    { id: 307, user_id: 204, verification_type_id: 3, status_id: 2, reviewed_by: ADMIN_ID, reviewed_at: fmt(daysAgo(9)),  review_comment: 'Income documentation valid' },
    { id: 308, user_id: 204, verification_type_id: 6, status_id: 2, reviewed_by: ADMIN_ID, reviewed_at: fmt(daysAgo(9)),  review_comment: 'Email confirmed' },
    { id: 309, user_id: 202, verification_type_id: 1, status_id: 3, reviewed_by: ADMIN_ID, reviewed_at: fmt(daysAgo(20)), review_comment: 'Document expired — please resubmit' },
    { id: 310, user_id: 210, verification_type_id: 1, status_id: 1, reviewed_by: null,     reviewed_at: null,             review_comment: null },
    { id: 311, user_id: 210, verification_type_id: 4, status_id: 1, reviewed_by: null,     reviewed_at: null,             review_comment: null },
    { id: 312, user_id: 211, verification_type_id: 4, status_id: 1, reviewed_by: null,     reviewed_at: null,             review_comment: null },
    { id: 313, user_id: 211, verification_type_id: 6, status_id: 1, reviewed_by: null,     reviewed_at: null,             review_comment: null },
  ];
  for (const v of verifs) {
    await ins(db, 'user_verifications', { ...v, created_at: fmt(daysAgo(rnd(1, 20))) });
  }
  // Verification documents
  const [vdCols] = await db.query('DESCRIBE verification_documents');
  const vdColNames = vdCols.map(c => c.Field);
  const vdocs = [
    { id: 200, verificationId: 300, filePath: '/uploads/verifications/user200_id.jpg' },
    { id: 201, verificationId: 302, filePath: '/uploads/verifications/user201_id.jpg' },
    { id: 202, verificationId: 303, filePath: '/uploads/verifications/user201_address.pdf' },
    { id: 203, verificationId: 310, filePath: '/uploads/verifications/user210_id.jpg' },
    { id: 204, verificationId: 312, filePath: '/uploads/verifications/user211_bik.pdf' },
  ];
  for (const vd of vdocs) {
    const row = { id: vd.id };
    if (vdColNames.includes('verificationId'))   row.verificationId = vd.verificationId;
    if (vdColNames.includes('verification_id'))  row.verification_id = vd.verificationId;
    if (vdColNames.includes('filePath'))         row.filePath = vd.filePath;
    if (vdColNames.includes('file_path'))        row.file_path = vd.filePath;
    if (vdColNames.includes('uploadedAt'))       row.uploadedAt = fmt(daysAgo(rnd(1, 10)));
    if (vdColNames.includes('uploaded_at'))      row.uploaded_at = fmt(daysAgo(rnd(1, 10)));
    if (vdColNames.includes('deletedAt'))        row.deletedAt = null;
    await ins(db, 'verification_documents', row);
  }
  console.log('   done');

  // ── 6. EXTRA LOAN APPLICATIONS ──────────────────────────────────────────
  console.log('── 6. Loan applications');
  const extraApps = [
    { id: 100, borrowerId: 204, amount: 8000,  durationMonths: 12, statusId: 1, purpose: 'Car repair',       fundedPct: 0,   repayment_type: 'ANNUITY' },
    { id: 101, borrowerId: 200, amount: 5000,  durationMonths: 6,  statusId: 1, purpose: 'Medical expenses', fundedPct: 0,   repayment_type: 'ANNUITY' },
    { id: 102, borrowerId: 205, amount: 20000, durationMonths: 24, statusId: 2, purpose: 'Home renovation',  fundedPct: 100, repayment_type: 'ANNUITY' },
    { id: 103, borrowerId: 204, amount: 12000, durationMonths: 18, statusId: 2, purpose: 'Business startup', fundedPct: 100, repayment_type: 'EQUAL'   },
    { id: 104, borrowerId: 204, amount: 3000,  durationMonths: 6,  statusId: 3, purpose: 'Vacation',         fundedPct: 100, repayment_type: 'ANNUITY' },
    { id: 105, borrowerId: 201, amount: 7500,  durationMonths: 12, statusId: 4, purpose: 'Equipment',        fundedPct: 0,   repayment_type: 'ANNUITY' },
    { id: 106, borrowerId: 202, amount: 50000, durationMonths: 60, statusId: 5, purpose: 'Real estate',      fundedPct: 0,   repayment_type: 'ANNUITY' },
  ];
  for (const a of extraApps) {
    await ins(db, 'loan_applications', {
      id: a.id, borrowerId: a.borrowerId, amount: a.amount,
      durationMonths: a.durationMonths, statusId: a.statusId,
      purpose: a.purpose, description: `Admin test - ${a.purpose}`,
      funded_amount: a.fundedPct === 100 ? a.amount : 0,
      fundedPercent: a.fundedPct, voluntary_commission: 0,
      repayment_type: a.repayment_type, commission_status: 'NONE',
      createdAt: fmt(daysAgo(rnd(30, 180))), updatedAt: fmt(daysAgo(rnd(1, 29))),
    });
  }
  console.log('   done');

  // ── 7. EXTRA LOANS ───────────────────────────────────────────────────────
  // loans: id, interest_rate, installment_count, voluntary_commission, lender_data_revealed,
  //        applicationId, borrowerId, totalAmount, fundedAmount, statusId, dueDate,
  //        createdAt, updatedAt, repayment_type
  console.log('── 7. Extra loans');
  const extraLoans = [
    { id: 100, applicationId: 102, borrowerId: 205, statusId: 1, amount: 20000, installments: 24, rate: 0.09 },
    { id: 101, applicationId: 103, borrowerId: 204, statusId: 1, amount: 12000, installments: 18, rate: 0.09 },
    { id: 102, applicationId: 104, borrowerId: 204, statusId: 2, amount:  3000, installments:  6, rate: 0.075 },
    { id: 103, applicationId: 106, borrowerId: 202, statusId: 3, amount:  8000, installments: 12, rate: 0.12 },
    { id: 104, applicationId: 106, borrowerId: 205, statusId: 3, amount: 15000, installments: 24, rate: 0.10 },
  ];
  for (const l of extraLoans) {
    await ins(db, 'loans', {
      id: l.id, applicationId: l.applicationId, borrowerId: l.borrowerId,
      statusId: l.statusId, totalAmount: l.amount, fundedAmount: l.amount,
      interest_rate: l.rate, installment_count: l.installments,
      voluntary_commission: 0, lender_data_revealed: 0,
      repayment_type: 'ANNUITY',
      dueDate: fmt(daysAhead(rnd(30, 360))),
      createdAt: fmt(daysAgo(rnd(30, 200))), updatedAt: fmt(daysAgo(rnd(1, 29))),
    });
  }
  console.log('   done');

  // ── 8. REPAYMENT SCHEDULES ───────────────────────────────────────────────
  // repayment_schedules: id, loan_id, total_installments, installment_amount, frequency, created_at
  console.log('── 8. Repayment schedules');
  const schedules = [
    { id: 1, loan_id: 100, total_installments: 24, installment_amount: 921.64, frequency: 'MONTHLY' },
    { id: 2, loan_id: 101, total_installments: 18, installment_amount: 723.82, frequency: 'MONTHLY' },
    { id: 3, loan_id: 102, total_installments:  6, installment_amount: 513.56, frequency: 'MONTHLY' },
    { id: 4, loan_id: 103, total_installments: 12, installment_amount: 722.08, frequency: 'MONTHLY' },
    { id: 5, loan_id: 104, total_installments: 24, installment_amount: 690.00, frequency: 'MONTHLY' },
  ];
  for (const s of schedules) {
    await ins(db, 'repayment_schedules', { ...s, created_at: fmt(daysAgo(rnd(1, 90))) });
  }
  console.log('   done');

  // ── 9. LOAN FEES ─────────────────────────────────────────────────────────
  // loan_fees: id, loan_id, fee_type, amount, applied_at
  console.log('── 9. Loan fees');
  const loanFees = [
    { id:  1, loan_id:   9, fee_type: 'ORIGINATION',    amount: 500.00 },
    { id:  2, loan_id:   9, fee_type: 'LATE_PAYMENT',   amount:  50.00 },
    { id:  3, loan_id:  14, fee_type: 'ORIGINATION',    amount: 300.00 },
    { id:  4, loan_id: 100, fee_type: 'ORIGINATION',    amount: 400.00 },
    { id:  5, loan_id: 100, fee_type: 'ADMINISTRATION', amount: 100.00 },
    { id:  6, loan_id: 101, fee_type: 'ORIGINATION',    amount: 240.00 },
    { id:  7, loan_id: 103, fee_type: 'ORIGINATION',    amount: 160.00 },
    { id:  8, loan_id: 103, fee_type: 'LATE_PAYMENT',   amount:  80.00 },
    { id:  9, loan_id: 103, fee_type: 'COLLECTION',     amount: 200.00 },
    { id: 10, loan_id: 104, fee_type: 'ORIGINATION',    amount: 300.00 },
    { id: 11, loan_id: 104, fee_type: 'COLLECTION',     amount: 450.00 },
  ];
  for (const f of loanFees) {
    await ins(db, 'loan_fees', { ...f, applied_at: fmt(daysAgo(rnd(1, 60))) });
  }
  console.log('   done');

  // ── 10. PAYMENTS ─────────────────────────────────────────────────────────
  console.log('── 10. Payments');
  const [pCols] = await db.query('DESCRIBE payments');
  const pColNames = pCols.map(c => c.Field);
  const payments = [
    { id: 100, userId: BORROWER_ID, loanId:   9, amount: 1590.00, paymentTypeId: 1, statusId: 2, providerId: 1 },
    { id: 101, userId: BORROWER_ID, loanId:   9, amount: 1590.00, paymentTypeId: 1, statusId: 2, providerId: 1 },
    { id: 102, userId: BORROWER_ID, loanId:  14, amount:  901.00, paymentTypeId: 1, statusId: 2, providerId: 1 },
    { id: 103, userId: BORROWER_ID, loanId:   9, amount: 1590.00, paymentTypeId: 1, statusId: 3, providerId: 1 }, // FAILED
    { id: 104, userId: 204,         loanId: 102, amount:  513.56, paymentTypeId: 1, statusId: 2, providerId: 1 },
    { id: 105, userId: 205,         loanId: 100, amount:  921.64, paymentTypeId: 1, statusId: 2, providerId: 1 },
    { id: 106, userId: 205,         loanId: 100, amount:  921.64, paymentTypeId: 1, statusId: 3, providerId: 1 }, // FAILED
    { id: 107, userId: LENDER_ID,   loanId: null,amount: 5000.00, paymentTypeId: 2, statusId: 2, providerId: 1 }, // DEPOSIT
    { id: 108, userId: 20,           loanId: null,amount: 3000.00, paymentTypeId: 2, statusId: 2, providerId: 1 }, // DEPOSIT
    { id: 109, userId: LENDER_ID,   loanId: null,amount: 2000.00, paymentTypeId: 3, statusId: 1, providerId: 1 }, // WITHDRAWAL PENDING
    { id: 110, userId: BORROWER_ID, loanId:   9, amount:  500.00, paymentTypeId: 4, statusId: 2, providerId: 1 }, // FEE
    { id: 111, userId: 205,         loanId: 104, amount: 1000.00, paymentTypeId: 1, statusId: 2, providerId: 1 },
  ];
  for (const p of payments) {
    const row = {
      id: p.id, userId: p.userId, loanId: p.loanId, amount: p.amount,
      paymentTypeId: p.paymentTypeId, statusId: p.statusId, providerId: p.providerId,
      createdAt: fmt(daysAgo(rnd(1, 60))),
      paid_at: p.statusId === 2 ? fmt(daysAgo(rnd(1, 59))) : null,
    };
    if (pColNames.includes('application_id'))    row.application_id = null;
    if (pColNames.includes('session_id'))        row.session_id = `sess_${p.id}_admin`;
    if (pColNames.includes('provider_order_id')) row.provider_order_id = `ORD_ADM_${p.id}`;
    if (pColNames.includes('courseId'))          row.courseId = null;
    if (pColNames.includes('payment_step'))      row.payment_step = 1;
    await ins(db, 'payments', row);
  }
  console.log('   done');

  // ── 11. CLAIMS ───────────────────────────────────────────────────────────
  console.log('── 11. Claims');
  const [clCols2] = await db.query('DESCRIBE claims');
  const clColNames2 = clCols2.map(c => c.Field);
  const claims = [
    { id: 10, loanId: 103, xmlPath: '/exports/claims/claim_loan103.xml' },
    { id: 11, loanId: 104, xmlPath: '/exports/claims/claim_loan104.xml' },
  ];
  for (const c of claims) {
    const row = { id: c.id, loanId: c.loanId };
    if (clColNames2.includes('xmlPath'))     row.xmlPath = c.xmlPath;
    if (clColNames2.includes('xml_path'))    row.xml_path = c.xmlPath;
    if (clColNames2.includes('generatedAt')) row.generatedAt = fmt(daysAgo(rnd(1, 30)));
    if (clColNames2.includes('createdAt'))   row.createdAt = fmt(daysAgo(rnd(1, 30)));
    await ins(db, 'claims', row);
  }
  console.log('   done');

  // ── 12. COMMISSION CONFIGS ───────────────────────────────────────────────
  console.log('── 12. Commission configs');
  const ccRows = [
    { id: 10, borrower_level: 0, min_loan_amount:   500, max_loan_amount:   5000, commission_pct: 2.50, config_type: 'STANDARD',  status: 'DRAFT',    created_by: ADMIN_ID, approved_by: null,    effective_from: fmt(daysAhead(30)), rejection_reason: null },
    { id: 11, borrower_level: 1, min_loan_amount:  1000, max_loan_amount:  10000, commission_pct: 2.00, config_type: 'STANDARD',  status: 'PENDING',  created_by: ADMIN_ID, approved_by: null,    effective_from: fmt(daysAhead(14)), rejection_reason: null },
    { id: 12, borrower_level: 2, min_loan_amount:  5000, max_loan_amount:  30000, commission_pct: 1.75, config_type: 'PREMIUM',   status: 'PENDING',  created_by: ADMIN_ID, approved_by: null,    effective_from: fmt(daysAhead(7)),  rejection_reason: null },
    { id: 13, borrower_level: 0, min_loan_amount:   500, max_loan_amount:   5000, commission_pct: 3.00, config_type: 'STANDARD',  status: 'APPROVED', created_by: ADMIN_ID, approved_by: SUPER_ID,effective_from: fmt(daysAgo(60)),   rejection_reason: null },
    { id: 14, borrower_level: 1, min_loan_amount:  1000, max_loan_amount:  15000, commission_pct: 2.50, config_type: 'STANDARD',  status: 'APPROVED', created_by: ADMIN_ID, approved_by: SUPER_ID,effective_from: fmt(daysAgo(30)),   rejection_reason: null },
    { id: 15, borrower_level: 3, min_loan_amount: 10000, max_loan_amount:  50000, commission_pct: 1.25, config_type: 'VIP',       status: 'APPROVED', created_by: SUPER_ID, approved_by: SUPER_ID,effective_from: fmt(daysAgo(15)),   rejection_reason: null },
    { id: 16, borrower_level: 4, min_loan_amount: 20000, max_loan_amount: 100000, commission_pct: 0.50, config_type: 'ENTERPRISE',status: 'REJECTED', created_by: ADMIN_ID, approved_by: SUPER_ID,effective_from: fmt(daysAgo(10)),   rejection_reason: 'Rate too low for risk level' },
    { id: 17, borrower_level: 0, min_loan_amount:   500, max_loan_amount:   5000, commission_pct: 3.50, config_type: 'STANDARD',  status: 'INACTIVE', created_by: ADMIN_ID, approved_by: SUPER_ID,effective_from: fmt(daysAgo(120)),  rejection_reason: null },
  ];
  for (const c of ccRows) {
    const row = {
      id: c.id, borrower_level: c.borrower_level,
      min_loan_amount: c.min_loan_amount, max_loan_amount: c.max_loan_amount,
      commission_pct: c.commission_pct, config_type: c.config_type,
      status: c.status, created_by: c.created_by, approved_by: c.approved_by,
      effective_from: c.effective_from, rejection_reason: c.rejection_reason,
      lender_frequent_payout_fee: 1.00, default_payout_day: 15,
      created_at: fmt(daysAgo(rnd(1, 60))), updated_at: fmt(daysAgo(rnd(0, 5))),
    };
    if (c.approved_by) row.approved_at = fmt(daysAgo(rnd(1, 10)));
    await ins(db, 'commission_configs', row);
  }
  console.log('   done');

  // ── 13. MANAGEMENT COMMISSIONS ───────────────────────────────────────────
  console.log('── 13. Management commissions');
  const mgmtComms = [
    { id: 10, company_id: COMPANY_1, commission_pct: 2.00, status: 'APPROVED', created_by: ADMIN_ID, approved_by: SUPER_ID, effective_year: 2024, calculation_basis: 'LOAN_AMOUNT',   payout_period: 'MONTHLY',   rejection_reason: null },
    { id: 11, company_id: COMPANY_2, commission_pct: 2.50, status: 'APPROVED', created_by: ADMIN_ID, approved_by: SUPER_ID, effective_year: 2024, calculation_basis: 'LOAN_AMOUNT',   payout_period: 'QUARTERLY', rejection_reason: null },
    { id: 12, company_id: COMPANY_1, commission_pct: 1.80, status: 'PENDING',  created_by: ADMIN_ID, approved_by: null,     effective_year: 2025, calculation_basis: 'FUNDED_AMOUNT', payout_period: 'MONTHLY',   rejection_reason: null },
    { id: 13, company_id: 3,          commission_pct: 3.00, status: 'PENDING',  created_by: ADMIN_ID, approved_by: null,     effective_year: 2025, calculation_basis: 'LOAN_AMOUNT',   payout_period: 'MONTHLY',   rejection_reason: null },
    { id: 14, company_id: COMPANY_2, commission_pct: 4.00, status: 'REJECTED', created_by: ADMIN_ID, approved_by: SUPER_ID, effective_year: 2025, calculation_basis: 'LOAN_AMOUNT',   payout_period: 'MONTHLY',   rejection_reason: 'Exceeds maximum allowed rate' },
  ];
  for (const m of mgmtComms) {
    await ins(db, 'management_commissions', {
      id: m.id, company_id: m.company_id, commission_pct: m.commission_pct,
      status: m.status, created_by: m.created_by, approved_by: m.approved_by,
      effective_year: m.effective_year, calculation_basis: m.calculation_basis,
      payout_period: m.payout_period, rejection_reason: m.rejection_reason,
      approved_at: m.approved_by ? fmt(daysAgo(rnd(1, 20))) : null,
      created_at: fmt(daysAgo(rnd(5, 90))), updated_at: fmt(daysAgo(rnd(0, 4))),
    });
  }
  console.log('   done');

  // ── 14. APPROVAL WORKFLOW LOGS ───────────────────────────────────────────
  console.log('── 14. Approval workflow logs');
  const awfRows = [
    { entity_type: 'COMMISSION_CONFIG',     entity_id: 11, from_status: 'DRAFT',   to_status: 'PENDING',  actor_id: ADMIN_ID, comment: 'Submitted for approval' },
    { entity_type: 'COMMISSION_CONFIG',     entity_id: 12, from_status: 'DRAFT',   to_status: 'PENDING',  actor_id: ADMIN_ID, comment: 'Ready for review' },
    { entity_type: 'COMMISSION_CONFIG',     entity_id: 13, from_status: 'PENDING', to_status: 'APPROVED', actor_id: SUPER_ID, comment: 'Config approved' },
    { entity_type: 'COMMISSION_CONFIG',     entity_id: 14, from_status: 'PENDING', to_status: 'APPROVED', actor_id: SUPER_ID, comment: 'Approved for level 1 borrowers' },
    { entity_type: 'COMMISSION_CONFIG',     entity_id: 16, from_status: 'PENDING', to_status: 'REJECTED', actor_id: SUPER_ID, comment: 'Rate too low for risk level' },
    { entity_type: 'MANAGEMENT_COMMISSION', entity_id: 10, from_status: 'PENDING', to_status: 'APPROVED', actor_id: SUPER_ID, comment: 'Annual commission approved' },
    { entity_type: 'MANAGEMENT_COMMISSION', entity_id: 14, from_status: 'PENDING', to_status: 'REJECTED', actor_id: SUPER_ID, comment: 'Exceeds maximum allowed rate' },
    { entity_type: 'USER',                  entity_id: 202, from_status: 'ACTIVE',  to_status: 'BLOCKED',  actor_id: ADMIN_ID, comment: 'Fraudulent activity detected' },
    { entity_type: 'LOAN',                  entity_id: 103, from_status: 'ACTIVE',  to_status: 'DEFAULTED',actor_id: ADMIN_ID, comment: 'No payment for 90 days' },
  ];
  for (const a of awfRows) {
    await ins(db, 'approval_workflow_logs', { ...a, created_at: fmt(daysAgo(rnd(1, 30))) });
  }
  console.log('   done');

  // ── 15. INTEREST RATE HISTORY ────────────────────────────────────────────
  console.log('── 15. Interest rate history');
  const [irCols] = await db.query('DESCRIBE interest_rates');
  const irColNames = irCols.map(c => c.Field);
  const irRows = [
    { id: 10, rate: 0.0600, effective_from: fmt(daysAgo(730)), effective_to: fmt(daysAgo(541)) },
    { id: 11, rate: 0.0650, effective_from: fmt(daysAgo(540)), effective_to: fmt(daysAgo(366)) },
    { id: 12, rate: 0.0700, effective_from: fmt(daysAgo(365)), effective_to: fmt(daysAgo(181)) },
  ];
  for (const r of irRows) {
    const row = { id: r.id };
    if (irColNames.includes('rate'))           row.rate = r.rate;
    if (irColNames.includes('max_rate'))       row.max_rate = 0.1200;
    if (irColNames.includes('effective_from')) row.effective_from = r.effective_from;
    if (irColNames.includes('effective_to'))   row.effective_to   = r.effective_to;
    if (irColNames.includes('created_by'))     row.created_by = ADMIN_ID;
    if (irColNames.includes('status'))         row.status = 'INACTIVE';
    await ins(db, 'interest_rates', row);
  }
  console.log('   done');

  // ── 16. MARKETPLACE LOAN REQUESTS ────────────────────────────────────────
  console.log('── 16. Marketplace loan requests');
  const loanRequests = [
    { id: 100, borrower_id: 204,        amount_requested:  8000, amount_funded:     0, min_funding_threshold:  5000, status: 'OPEN',     funding_window_ends_at: fmt(daysAhead(25)) },
    { id: 101, borrower_id: 200,        amount_requested:  5000, amount_funded:     0, min_funding_threshold:  4000, status: 'OPEN',     funding_window_ends_at: fmt(daysAhead(20)) },
    { id: 102, borrower_id: 205,        amount_requested: 20000, amount_funded: 12000, min_funding_threshold: 15000, status: 'BIDDING',  funding_window_ends_at: fmt(daysAhead(10)) },
    { id: 103, borrower_id: BORROWER_ID,amount_requested: 50000, amount_funded: 35000, min_funding_threshold: 40000, status: 'BIDDING',  funding_window_ends_at: fmt(daysAhead(5))  },
    { id: 104, borrower_id: 204,        amount_requested: 12000, amount_funded: 12000, min_funding_threshold: 10000, status: 'FUNDED',   funding_window_ends_at: fmt(daysAhead(3))  },
    { id: 105, borrower_id: 205,        amount_requested: 15000, amount_funded: 15000, min_funding_threshold: 12000, status: 'ACTIVE',   funding_window_ends_at: fmt(daysAgo(20))   },
    { id: 106, borrower_id: 201,        amount_requested:  7500, amount_funded:     0, min_funding_threshold:  5000, status: 'CANCELLED',funding_window_ends_at: fmt(daysAgo(10))   },
  ];
  for (const lr of loanRequests) {
    await ins(db, 'loan_requests', { id: lr.id, borrower_id: lr.borrower_id,
      amount_requested: lr.amount_requested, amount_funded: lr.amount_funded,
      min_funding_threshold: lr.min_funding_threshold, status: lr.status,
      funding_window_ends_at: lr.funding_window_ends_at, auto_close: 1,
      created_at: fmt(daysAgo(rnd(5, 30))), updated_at: fmt(daysAgo(rnd(0, 4))) });
  }
  console.log('   done');

  // ── 17. MARKETPLACE BIDS ─────────────────────────────────────────────────
  // status enum: ACTIVE, PARTIALLY_FILLED, FILLED, EXPIRED, REJECTED
  console.log('── 17. Marketplace bids');
  const bids = [
    { loan_request_id: 100, lender_id: LENDER_ID, bid_amount:  3000, allocated_amount:    0, status: 'ACTIVE' },
    { loan_request_id: 100, lender_id: 20,          bid_amount:  2500, allocated_amount:    0, status: 'ACTIVE' },
    { loan_request_id: 102, lender_id: LENDER_ID, bid_amount:  5000, allocated_amount:    0, status: 'ACTIVE' },
    { loan_request_id: 102, lender_id: 20,          bid_amount:  4000, allocated_amount:    0, status: 'ACTIVE' },
    { loan_request_id: 102, lender_id: 21,          bid_amount:  3000, allocated_amount:    0, status: 'ACTIVE' },
    { loan_request_id: 103, lender_id: LENDER_ID, bid_amount: 10000, allocated_amount:    0, status: 'ACTIVE' },
    { loan_request_id: 103, lender_id: 20,          bid_amount: 12000, allocated_amount:    0, status: 'ACTIVE' },
    { loan_request_id: 103, lender_id: 21,          bid_amount:  8000, allocated_amount:    0, status: 'ACTIVE' },
    { loan_request_id: 103, lender_id: 22,          bid_amount:  5000, allocated_amount:    0, status: 'ACTIVE' },
    { loan_request_id: 104, lender_id: LENDER_ID, bid_amount:  6000, allocated_amount: 6000, status: 'FILLED' },
    { loan_request_id: 104, lender_id: 20,          bid_amount:  6000, allocated_amount: 6000, status: 'FILLED' },
    { loan_request_id: 105, lender_id: LENDER_ID, bid_amount:  7500, allocated_amount: 7500, status: 'PARTIALLY_FILLED' },
    { loan_request_id: 105, lender_id: 20,          bid_amount:  7500, allocated_amount: 7500, status: 'PARTIALLY_FILLED' },
    { loan_request_id: 106, lender_id: 21,          bid_amount:  3000, allocated_amount:    0, status: 'EXPIRED' },
  ];
  for (const b of bids) {
    await ins(db, 'marketplace_bids', { loan_request_id: b.loan_request_id,
      lender_id: b.lender_id, company_id: null,
      bid_amount: b.bid_amount, allocated_amount: b.allocated_amount,
      locked_funds: b.status === 'ACTIVE' ? 1 : 0, status: b.status,
      created_at: fmt(daysAgo(rnd(1, 20))), updated_at: fmt(daysAgo(rnd(0, 3))) });
  }
  console.log('   done');

  // ── 18. FUNDING POOLS & ALLOCATIONS ─────────────────────────────────────
  // funding_pools: id, loan_request_id, total_pool_amount, created_at
  // funding_allocations: id, loan_request_id, bid_id, lender_id, allocated_amount, created_at
  console.log('── 18. Funding pools & allocations');
  const fpRows = [
    { id: 10, loan_request_id: 104, total_pool_amount: 12000 },
    { id: 11, loan_request_id: 105, total_pool_amount: 15000 },
    { id: 12, loan_request_id: 102, total_pool_amount: 12000 },
    { id: 13, loan_request_id: 103, total_pool_amount: 35000 },
  ];
  for (const fp of fpRows) {
    await ins(db, 'funding_pools', { id: fp.id, loan_request_id: fp.loan_request_id,
      total_pool_amount: fp.total_pool_amount, created_at: fmt(daysAgo(rnd(5, 30))) });
  }
  // Funding allocations — look up actual inserted bid IDs
  const [bid104Rows] = await db.query(
    'SELECT id, lender_id FROM marketplace_bids WHERE loan_request_id = 104 ORDER BY id ASC LIMIT 2');
  const [bid105Rows] = await db.query(
    'SELECT id, lender_id FROM marketplace_bids WHERE loan_request_id = 105 ORDER BY id ASC LIMIT 2');
  let faId = 10;
  for (const bid of bid104Rows) {
    await ins(db, 'funding_allocations', { id: faId++, loan_request_id: 104,
      bid_id: bid.id, lender_id: bid.lender_id, allocated_amount: 6000,
      created_at: fmt(daysAgo(rnd(3, 20))) });
  }
  for (const bid of bid105Rows) {
    await ins(db, 'funding_allocations', { id: faId++, loan_request_id: 105,
      bid_id: bid.id, lender_id: bid.lender_id, allocated_amount: 7500,
      created_at: fmt(daysAgo(rnd(5, 25))) });
  }
  console.log('   done');

  // ── 19. AUTO INVEST RULES ────────────────────────────────────────────────
  console.log('── 19. Auto invest rules');
  const airRows = [
    { id: 1, companyId: COMPANY_1, minLevel: 1, maxAmount:  50000, active: 1 },
    { id: 2, companyId: COMPANY_1, minLevel: 2, maxAmount: 100000, active: 0 },
    { id: 3, companyId: COMPANY_2, minLevel: 0, maxAmount:  30000, active: 1 },
    { id: 4, companyId: 3,          minLevel: 1, maxAmount:  20000, active: 1 },
  ];
  for (const a of airRows) {
    await ins(db, 'auto_invest_rules', { ...a,
      createdAt: fmt(daysAgo(rnd(10, 90))), updatedAt: fmt(daysAgo(rnd(0, 9))) });
  }
  console.log('   done');

  // ── 20. LOAN OFFERS ──────────────────────────────────────────────────────
  console.log('── 20. Loan offers');
  const [loCols] = await db.query('DESCRIBE loan_offers');
  const loColNames = loCols.map(c => c.Field);
  const loffers = [
    { id: 100, loanId: 100, lenderId: LENDER_ID, amount: 3000 },
    { id: 101, loanId: 100, lenderId: 20,          amount: 2500 },
    { id: 102, loanId: 101, lenderId: 21,          amount: 2000 },
    { id: 103, loanId: 102, lenderId: LENDER_ID, amount: 1500 },
  ];
  for (const lo of loffers) {
    const row = { id: lo.id, loanId: lo.loanId, lenderId: lo.lenderId, amount: lo.amount };
    if (loColNames.includes('confirmed_amount')) row.confirmed_amount = lo.amount;
    if (loColNames.includes('createdAt')) row.createdAt = fmt(daysAgo(rnd(5, 40)));
    await ins(db, 'loan_offers', row);
  }
  console.log('   done');

  // ── 21. EMAIL TEMPLATES ──────────────────────────────────────────────────
  console.log('── 21. Email templates');
  const [etCols] = await db.query('DESCRIBE email_templates');
  const etColNames = etCols.map(c => c.Field);
  const emailTemplates = [
    { id:  1, name: 'WELCOME',               subject: 'Welcome to LMS Platform',                body: '<h1>Welcome {{firstName}}!</h1><p>Your account has been created.</p>' },
    { id:  2, name: 'VERIFICATION_APPROVED', subject: 'Verification approved',                   body: '<p>Hi {{firstName}}, your {{verificationType}} verification has been approved.</p>' },
    { id:  3, name: 'VERIFICATION_REJECTED', subject: 'Action required: Verification rejected',  body: '<p>Hi {{firstName}}, your verification was rejected. Reason: {{reason}}</p>' },
    { id:  4, name: 'LOAN_APPROVED',         subject: 'Loan application approved',               body: '<p>Hi {{firstName}}, your loan of {{amount}} PLN has been approved!</p>' },
    { id:  5, name: 'LOAN_FUNDED',           subject: 'Your loan has been funded',               body: '<p>Hi {{firstName}}, loan #{{loanId}} has been fully funded.</p>' },
    { id:  6, name: 'PAYMENT_DUE',           subject: 'Payment due in 3 days',                  body: '<p>Hi {{firstName}}, installment of {{amount}} PLN is due on {{dueDate}}.</p>' },
    { id:  7, name: 'PAYMENT_OVERDUE',       subject: 'URGENT: Payment overdue',                 body: '<p>Hi {{firstName}}, payment of {{amount}} PLN overdue since {{dueDate}}.</p>' },
    { id:  8, name: 'PAYMENT_RECEIVED',      subject: 'Payment received',                        body: '<p>Hi {{firstName}}, payment of {{amount}} PLN received. Thank you!</p>' },
    { id:  9, name: 'LOAN_REPAID',           subject: 'Loan fully repaid!',                      body: '<p>Hi {{firstName}}, loan #{{loanId}} has been fully repaid. Congratulations!</p>' },
    { id: 10, name: 'LENDER_WITHDRAWAL',     subject: 'Withdrawal request received',             body: '<p>Hi {{firstName}}, withdrawal of {{amount}} PLN is being processed.</p>' },
    { id: 11, name: 'BID_PLACED',            subject: 'Bid placed',                              body: '<p>Hi {{firstName}}, bid of {{amount}} PLN on request #{{loanRequestId}} is active.</p>' },
    { id: 12, name: 'PASSWORD_RESET',        subject: 'Password reset request',                 body: '<p>Hi {{firstName}}, click <a href="{{resetLink}}">here</a> to reset password.</p>' },
    { id: 13, name: 'ACCOUNT_BLOCKED',       subject: 'Account suspended',                      body: '<p>Hi {{firstName}}, your account has been suspended. Reason: {{reason}}</p>' },
    { id: 14, name: 'LOAN_DEFAULTED',        subject: 'Loan in default',                        body: '<p>Hi {{firstName}}, loan #{{loanId}} is in default. Contact us immediately.</p>' },
  ];
  for (const t of emailTemplates) {
    const row = { id: t.id };
    if (etColNames.includes('name'))       row.name = t.name;
    if (etColNames.includes('code'))       row.code = t.name;
    if (etColNames.includes('subject'))    row.subject = t.subject;
    if (etColNames.includes('body'))       row.body = t.body;
    if (etColNames.includes('html_body'))  row.html_body = t.body;
    if (etColNames.includes('is_active'))  row.is_active = 1;
    if (etColNames.includes('created_at')) row.created_at = fmt(daysAgo(rnd(10, 60)));
    if (etColNames.includes('createdAt'))  row.createdAt  = fmt(daysAgo(rnd(10, 60)));
    if (etColNames.includes('updatedAt'))  row.updatedAt  = fmt(daysAgo(rnd(0, 9)));
    await ins(db, 'email_templates', row);
  }
  console.log('   done');

  // ── 22. SMS TEMPLATES ────────────────────────────────────────────────────
  console.log('── 22. SMS templates');
  const [stCols] = await db.query('DESCRIBE sms_templates');
  const stColNames = stCols.map(c => c.Field);
  const smsTemplates = [
    { id: 1, name: 'PAYMENT_DUE',       body: 'LMS: Payment of {{amount}} PLN due on {{dueDate}}. Log in to pay.' },
    { id: 2, name: 'PAYMENT_OVERDUE',   body: 'LMS URGENT: Payment of {{amount}} PLN overdue since {{dueDate}}.' },
    { id: 3, name: 'LOAN_APPROVED',     body: 'LMS: Loan {{amount}} PLN approved! Funds arrive in 1-2 business days.' },
    { id: 4, name: 'VERIFICATION_CODE', body: 'LMS: Your verification code is {{code}}. Valid for 10 minutes.' },
    { id: 5, name: 'ACCOUNT_BLOCKED',   body: 'LMS: Your account has been suspended. Contact support@lms.com.' },
    { id: 6, name: 'BID_ACCEPTED',      body: 'LMS: Bid on loan #{{loanId}} accepted. {{amount}} PLN allocated.' },
  ];
  for (const t of smsTemplates) {
    const row = { id: t.id };
    if (stColNames.includes('name'))       row.name = t.name;
    if (stColNames.includes('code'))       row.code = t.name;
    if (stColNames.includes('body'))       row.body = t.body;
    if (stColNames.includes('message'))    row.message = t.body;
    if (stColNames.includes('is_active'))  row.is_active = 1;
    if (stColNames.includes('created_at')) row.created_at = fmt(daysAgo(rnd(10, 60)));
    if (stColNames.includes('createdAt'))  row.createdAt  = fmt(daysAgo(rnd(10, 60)));
    await ins(db, 'sms_templates', row);
  }
  console.log('   done');

  // ── 23. NOTIFICATION TEMPLATES ───────────────────────────────────────────
  // notification_templates: id, code, locale, is_active, created_at, updated_at,
  //                         titleTemplate, bodyTemplate
  console.log('── 23. Notification templates');
  const notifTemplates = [
    { id: 100, code: 'VERIFICATION_APPROVED',   titleTemplate: 'Verification Approved',   bodyTemplate: 'Your {{verificationType}} verification has been approved.' },
    { id: 101, code: 'VERIFICATION_REJECTED',   titleTemplate: 'Verification Rejected',   bodyTemplate: 'Your verification was rejected: {{reason}}' },
    { id: 102, code: 'LOAN_APPLICATION_UPDATE', titleTemplate: 'Loan Application Update', bodyTemplate: 'Loan #{{appId}} status changed to {{status}}.' },
    { id: 103, code: 'PAYMENT_DUE_REMINDER',    titleTemplate: 'Payment Due Reminder',    bodyTemplate: 'Payment of {{amount}} PLN due on {{dueDate}}.' },
    { id: 104, code: 'PAYMENT_OVERDUE_ALERT',   titleTemplate: 'Payment Overdue',         bodyTemplate: 'OVERDUE: {{amount}} PLN was due on {{dueDate}}.' },
    { id: 105, code: 'BID_PLACED',              titleTemplate: 'Bid Placed',              bodyTemplate: 'Bid of {{amount}} PLN placed on loan #{{loanId}}.' },
    { id: 106, code: 'LOAN_FUNDED',             titleTemplate: 'Loan Funded',             bodyTemplate: 'Loan request #{{loanId}} has been fully funded!' },
    { id: 107, code: 'WITHDRAWAL_PROCESSED',    titleTemplate: 'Withdrawal Processed',    bodyTemplate: 'Withdrawal of {{amount}} PLN processed successfully.' },
    { id: 108, code: 'SYSTEM_MAINTENANCE',      titleTemplate: 'System Maintenance',      bodyTemplate: 'Platform maintenance scheduled: {{date}}.' },
    { id: 109, code: 'ACCOUNT_STATUS_UPDATE',   titleTemplate: 'Account Status Changed',  bodyTemplate: 'Your account status changed to {{status}}.' },
  ];
  for (const t of notifTemplates) {
    await ins(db, 'notification_templates', { id: t.id, code: t.code, locale: 'en', is_active: 1,
      titleTemplate: t.titleTemplate, bodyTemplate: t.bodyTemplate,
      created_at: fmt(daysAgo(rnd(5, 30))), updated_at: fmt(daysAgo(rnd(0, 4))) });
  }
  console.log('   done');

  // ── 24. PLATFORM CONFIGS ─────────────────────────────────────────────────
  // platform_configs: id, `key`, `value`, description, version, createdAt, updatedAt
  // NOTE: 'key' and 'value' are MySQL reserved words — must use backticks
  console.log('── 24. Platform configs');
  const platformConfigs = [
    { key: 'PLATFORM_NAME',           value: 'LMS Platform',    description: 'Platform display name' },
    { key: 'MIN_LOAN_AMOUNT',         value: '500',             description: 'Minimum loan amount (PLN)' },
    { key: 'MAX_LOAN_AMOUNT',         value: '100000',          description: 'Maximum loan amount (PLN)' },
    { key: 'MIN_LENDER_DEPOSIT',      value: '1000',            description: 'Minimum lender deposit (PLN)' },
    { key: 'MAX_ACTIVE_LOANS',        value: '3',               description: 'Max active loans per borrower' },
    { key: 'MAX_LOAN_DURATION_MONTHS',value: '60',              description: 'Max loan duration (months)' },
    { key: 'MIN_LOAN_DURATION_MONTHS',value: '1',               description: 'Min loan duration (months)' },
    { key: 'DEFAULT_COMMISSION_RATE', value: '2.5',             description: 'Default commission rate (%)' },
    { key: 'FUNDING_WINDOW_DAYS',     value: '30',              description: 'Bidding window duration (days)' },
    { key: 'MIN_FUNDING_THRESHOLD',   value: '80',              description: 'Min funding threshold (%)' },
    { key: 'DATA_RETENTION_YEARS',    value: '7',               description: 'Data retention period (years)' },
    { key: 'SUPPORT_EMAIL',           value: 'support@lms.com', description: 'Support contact email' },
    { key: 'MAINTENANCE_MODE',        value: 'false',           description: 'Platform maintenance mode flag' },
    { key: 'ENABLE_BIK_CHECK',        value: 'true',            description: 'Enable BIK credit check' },
    { key: 'ENABLE_AUTO_INVEST',      value: 'true',            description: 'Enable auto-invest for companies' },
    { key: 'LATE_PAYMENT_FEE_RATE',   value: '0.5',             description: 'Daily late payment fee (%)' },
    { key: 'ORIGINATION_FEE_RATE',    value: '1.0',             description: 'Origination fee (%)' },
    { key: 'WITHDRAWAL_MIN_AMOUNT',   value: '100',             description: 'Minimum withdrawal (PLN)' },
  ];
  const [existingPcRows] = await db.query('SELECT `key` FROM `platform_configs`');
  const existingKeySet = new Set(existingPcRows.map(r => r.key));
  for (const pc of platformConfigs) {
    if (existingKeySet.has(pc.key)) { skipped++; continue; }
    await db.query(
      'INSERT INTO `platform_configs` (`key`, `value`, `description`, `version`, `createdAt`, `updatedAt`) VALUES (?,?,?,?,?,?)',
      [pc.key, pc.value, pc.description, 1, fmt(daysAgo(rnd(10, 90))), fmt(daysAgo(rnd(0, 9)))]
    );
    inserted++;
  }
  console.log('   done');

  // ── 25. PLATFORM CONFIG (singleton) ─────────────────────────────────────
  console.log('── 25. Platform config singleton');
  const [existingPc1] = await db.query('SELECT id FROM platform_config LIMIT 1');
  if (existingPc1.length === 0) {
    await ins(db, 'platform_config', {
      id: 1, min_loan_amount: 500, min_lender_amount: 1000,
      reminders_json: JSON.stringify([
        { days_before: 7,  channel: 'EMAIL', message: 'Payment due in 7 days' },
        { days_before: 3,  channel: 'SMS',   message: 'Payment due in 3 days' },
        { days_before: 1,  channel: 'PUSH',  message: 'Payment due tomorrow' },
        { days_before: -1, channel: 'SMS',   message: 'Payment overdue' },
      ]),
      retention_years: 7, max_active_loans_per_borrower: 3,
      max_active_loans_per_lender: 50, min_loan_duration: 1, max_loan_duration: 60,
      commission_rate: 2.50, updated_at: fmt(daysAgo(5)),
    });
  } else {
    console.log('   (already populated)');
    skipped++;
  }
  console.log('   done');

  // ── 26. DATA RETENTION QUEUE ─────────────────────────────────────────────
  console.log('── 26. Data retention queue');
  const drRows = [
    { id: 1, tableName: 'audit_logs',    recordId:   1, deleteAt: fmt(daysAhead(365 * 7 - 30)) },
    { id: 2, tableName: 'audit_logs',    recordId:   2, deleteAt: fmt(daysAhead(365 * 7 - 31)) },
    { id: 3, tableName: 'user_sessions', recordId: 100, deleteAt: fmt(daysAhead(30)) },
    { id: 4, tableName: 'notifications', recordId:   1, deleteAt: fmt(daysAgo(5))  }, // already due
    { id: 5, tableName: 'notifications', recordId:   2, deleteAt: fmt(daysAgo(2))  }, // already due
    { id: 6, tableName: 'audit_logs',    recordId:  10, deleteAt: fmt(daysAhead(365 * 5)) },
    { id: 7, tableName: 'payments',      recordId: 100, deleteAt: fmt(daysAhead(365 * 7)) },
    { id: 8, tableName: 'payments',      recordId: 101, deleteAt: fmt(daysAhead(365 * 7)) },
  ];
  for (const r of drRows) {
    await ins(db, 'data_retention_queue', { ...r, createdAt: fmt(daysAgo(rnd(1, 30))) });
  }
  console.log('   done');

  // ── 27. EXPORTS ──────────────────────────────────────────────────────────
  // exports: id, export_type_id, created_by, file_path, created_at, record_count, metadata
  console.log('── 27. Exports');
  const [exCols] = await db.query('DESCRIBE exports');
  const exColNames = exCols.map(c => c.Field);
  const exportRows = [
    { export_type_id: 1, created_by: ADMIN_ID, file_path: '/exports/loans_2025_q1.xml',    record_count: 120, status: 'COMPLETED'  },
    { export_type_id: 1, created_by: ADMIN_ID, file_path: '/exports/loans_2025_q2.xml',    record_count:  98, status: 'COMPLETED'  },
    { export_type_id: 2, created_by: ADMIN_ID, file_path: '/exports/users_2025_03.csv',    record_count:  23, status: 'COMPLETED'  },
    { export_type_id: 3, created_by: ADMIN_ID, file_path: '/exports/payments_2025.csv',    record_count: 112, status: 'COMPLETED'  },
    { export_type_id: 1, created_by: SUPER_ID, file_path: '/exports/defaulted_loans.xml',  record_count:   4, status: 'COMPLETED'  },
    { export_type_id: 2, created_by: ADMIN_ID, file_path: '/exports/pending_users.csv',    record_count:   8, status: 'COMPLETED'  },
    { export_type_id: 1, created_by: ADMIN_ID, file_path: null,                             record_count: null,status: 'PROCESSING' },
    { export_type_id: 3, created_by: ADMIN_ID, file_path: null,                             record_count: null,status: 'FAILED'     },
  ];
  for (const e of exportRows) {
    const row = { export_type_id: e.export_type_id, created_by: e.created_by,
      file_path: e.file_path, record_count: e.record_count,
      created_at: fmt(daysAgo(rnd(1, 90))) };
    if (exColNames.includes('status'))   row.status = e.status;
    if (exColNames.includes('metadata')) row.metadata = JSON.stringify({ format: e.export_type_id === 1 ? 'XML' : 'CSV' });
    await ins(db, 'exports', row);
  }
  console.log('   done');

  // ── 28. ADMIN NOTIFICATIONS ──────────────────────────────────────────────
  // notifications: id, user_id, type, read, createdAt, readAt, payload
  console.log('── 28. Admin notifications');
  const adminNotifs = [
    { user_id: ADMIN_ID, type: 'PENDING_VERIFICATIONS', read: 0, payload: JSON.stringify({ count: 5,      message: '5 users awaiting KYC approval' }) },
    { user_id: ADMIN_ID, type: 'COMMISSION_PENDING',    read: 0, payload: JSON.stringify({ configId: 11, message: 'Config #11 awaiting review' }) },
    { user_id: ADMIN_ID, type: 'LOAN_DEFAULTED',        read: 0, payload: JSON.stringify({ loanId: 103,  message: 'Loan #103 flagged as DEFAULTED' }) },
    { user_id: ADMIN_ID, type: 'EXPORT_COMPLETED',      read: 1, payload: JSON.stringify({ exportId: 1,  message: 'Q1 2025 loan export is ready' }) },
    { user_id: ADMIN_ID, type: 'SYSTEM_MAINTENANCE',    read: 1, payload: JSON.stringify({ date: '2026-03-15', message: 'Maintenance on 2026-03-15 02:00 UTC' }) },
    { user_id: SUPER_ID, type: 'COMMISSION_PENDING',    read: 0, payload: JSON.stringify({ count: 2,     message: '2 commission configs require approval' }) },
    { user_id: SUPER_ID, type: 'USER_BLOCKED',          read: 1, payload: JSON.stringify({ userId: 202, message: 'blocked.borrower@lms.com was blocked' }) },
    { user_id: SUPER_ID, type: 'DATA_RETENTION_DUE',   read: 0, payload: JSON.stringify({ count: 2,     message: '2 records scheduled for deletion' }) },
  ];
  for (const n of adminNotifs) {
    await ins(db, 'notifications', { user_id: n.user_id, type: n.type, read: n.read,
      payload: n.payload, readAt: n.read ? fmt(daysAgo(rnd(0, 3))) : null,
      createdAt: fmt(daysAgo(rnd(0, 14))) });
  }
  console.log('   done');

  // ── 29. AUDIT LOGS (admin actions) ───────────────────────────────────────
  // audit_logs: id, user_id, action, entity, entity_id, created_at, metadata, ip
  console.log('── 29. Audit logs');
  const adminAuditLogs = [
    { user_id: ADMIN_ID, action: 'USER_STATUS_CHANGED',    entity: 'USER',              entity_id: 200, metadata: JSON.stringify({ from: 'PENDING',  to: 'ACTIVE',    reason: 'KYC verified' }) },
    { user_id: ADMIN_ID, action: 'USER_STATUS_CHANGED',    entity: 'USER',              entity_id: 202, metadata: JSON.stringify({ from: 'ACTIVE',   to: 'BLOCKED',   reason: 'Fraudulent activity' }) },
    { user_id: ADMIN_ID, action: 'VERIFICATION_APPROVED',  entity: 'VERIFICATION',      entity_id: 305, metadata: JSON.stringify({ type: 'ID',       userId: 204 }) },
    { user_id: ADMIN_ID, action: 'VERIFICATION_REJECTED',  entity: 'VERIFICATION',      entity_id: 309, metadata: JSON.stringify({ type: 'ID',       reason: 'Expired document' }) },
    { user_id: SUPER_ID, action: 'COMMISSION_APPROVED',    entity: 'COMMISSION_CONFIG', entity_id:  13, metadata: JSON.stringify({ rate: 3.0,        type: 'STANDARD' }) },
    { user_id: SUPER_ID, action: 'COMMISSION_REJECTED',    entity: 'COMMISSION_CONFIG', entity_id:  16, metadata: JSON.stringify({ rate: 0.5,        reason: 'Rate too low' }) },
    { user_id: ADMIN_ID, action: 'LOAN_INTERVENTION_NOTE', entity: 'LOAN',              entity_id: 103, metadata: JSON.stringify({ note: 'Borrower contacted, agreed payment by 2026-03-15' }) },
    { user_id: ADMIN_ID, action: 'LOAN_DEFAULTED',         entity: 'LOAN',              entity_id: 103, metadata: JSON.stringify({ reason: 'No payment for 90+ days' }) },
    { user_id: SUPER_ID, action: 'LOAN_CLOSED',            entity: 'LOAN',              entity_id: 102, metadata: JSON.stringify({ reason: 'Fully repaid' }) },
    { user_id: ADMIN_ID, action: 'EXPORT_GENERATED',       entity: 'EXPORT',            entity_id:   1, metadata: JSON.stringify({ type: 'LOANS',    format: 'XML' }) },
    { user_id: ADMIN_ID, action: 'CONFIG_UPDATED',         entity: 'PLATFORM_CONFIG',   entity_id:   1, metadata: JSON.stringify({ key: 'MIN_LOAN_AMOUNT', from: '300', to: '500' }) },
    { user_id: SUPER_ID, action: 'MGMT_COMM_APPROVED',     entity: 'MGMT_COMMISSION',   entity_id:  10, metadata: JSON.stringify({ company: 'Firma Inwestycyjna', rate: 2.0 }) },
    { user_id: ADMIN_ID, action: 'MARKETPLACE_BID_REVIEW', entity: 'MARKETPLACE_BID',   entity_id:  10, metadata: JSON.stringify({ loanRequestId: 104, amount: 6000 }) },
    { user_id: SUPER_ID, action: 'USER_LEVEL_CHANGED',     entity: 'USER',              entity_id: 204, metadata: JSON.stringify({ from: 2, to: 3,  reason: 'Good repayment history' }) },
    { user_id: ADMIN_ID, action: 'RETENTION_SCHEDULED',    entity: 'AUDIT_LOG',         entity_id:   1, metadata: JSON.stringify({ scheduledDate: fmt(daysAhead(365 * 7)) }) },
    { user_id: ADMIN_ID, action: 'TEMPLATE_UPDATED',       entity: 'EMAIL_TEMPLATE',    entity_id:   6, metadata: JSON.stringify({ name: 'PAYMENT_DUE', field: 'subject' }) },
    { user_id: SUPER_ID, action: 'INTEREST_RATE_SET',      entity: 'INTEREST_RATE',     entity_id:   3, metadata: JSON.stringify({ rate: 0.095, effectiveFrom: '2025-01-01' }) },
    { user_id: ADMIN_ID, action: 'COMPANY_CREATED',        entity: 'COMPANY',           entity_id:   3, metadata: JSON.stringify({ name: 'Inwestycje Polska Sp. z o.o.' }) },
    { user_id: ADMIN_ID, action: 'COMPANY_LENDER_ADDED',   entity: 'COMPANY',           entity_id:   1, metadata: JSON.stringify({ lenderId: 20 }) },
    { user_id: SUPER_ID, action: 'LOAN_BLOCK_BORROWER',    entity: 'LOAN',              entity_id: 103, metadata: JSON.stringify({ borrowerId: 202, reason: 'Default — fraud suspected' }) },
    { user_id: ADMIN_ID, action: 'NOTIFICATION_SENT',      entity: 'NOTIFICATION',      entity_id:   1, metadata: JSON.stringify({ type: 'SYSTEM',   target: 'ALL_ADMINS' }) },
    { user_id: ADMIN_ID, action: 'USER_BULK_APPROVED',     entity: 'USER',              entity_id:   0, metadata: JSON.stringify({ count: 3,         ids: [200, 201, 203] }) },
  ];
  for (const log of adminAuditLogs) {
    await ins(db, 'audit_logs', { user_id: log.user_id, action: log.action,
      entity: log.entity, entity_id: log.entity_id, metadata: log.metadata,
      ip: '192.168.1.1', created_at: fmt(daysAgo(rnd(0, 60))) });
  }
  console.log('   done');

  // ── 30. REPAYMENTS (overdue analytics for reports) ───────────────────────
  console.log('── 30. Repayments');
  const [repCols] = await db.query('DESCRIBE repayments');
  const repColNames = repCols.map(c => c.Field);
  const extraRepayments = [];
  // loan 100 — ACTIVE: 6 paid + 1 overdue + 2 upcoming
  for (let i = 1; i <= 9; i++) {
    const dueDate = fmt(daysAgo(180 - i * 30));
    const status  = i <= 6 ? 'PAID' : (i === 7 ? 'OVERDUE' : 'PENDING');
    extraRepayments.push({ loanId: 100, amount: 921.64, dueDate, status, paidAt: status === 'PAID' ? fmt(daysAgo(181 - i * 30)) : null });
  }
  // loan 103 — DEFAULTED: 3 paid, 9 overdue
  for (let i = 1; i <= 12; i++) {
    const dueDate = fmt(daysAgo(360 - i * 30));
    const status  = i <= 3 ? 'PAID' : 'OVERDUE';
    extraRepayments.push({ loanId: 103, amount: 722.08, dueDate, status, paidAt: status === 'PAID' ? fmt(daysAgo(361 - i * 30)) : null });
  }
  // loan 104 — DEFAULTED: 2 paid, 6 overdue
  for (let i = 1; i <= 8; i++) {
    const dueDate = fmt(daysAgo(240 - i * 30));
    const status  = i <= 2 ? 'PAID' : 'OVERDUE';
    extraRepayments.push({ loanId: 104, amount: 700.00, dueDate, status, paidAt: status === 'PAID' ? fmt(daysAgo(241 - i * 30)) : null });
  }
  for (const r of extraRepayments) {
    const row = {};
    if (repColNames.includes('loanId'))    row.loanId   = r.loanId;
    if (repColNames.includes('loan_id'))   row.loan_id  = r.loanId;
    if (repColNames.includes('amount'))    row.amount   = r.amount;
    if (repColNames.includes('dueDate'))   row.dueDate  = r.dueDate;
    if (repColNames.includes('due_date'))  row.due_date = r.dueDate;
    if (repColNames.includes('status'))    row.status   = r.status;
    if (repColNames.includes('paidAt'))    row.paidAt   = r.paidAt;
    if (repColNames.includes('paid_at'))   row.paid_at  = r.paidAt;
    if (repColNames.includes('createdAt')) row.createdAt = fmt(daysAgo(rnd(10, 90)));
    if (Object.keys(row).length > 0) await ins(db, 'repayments', row);
  }
  console.log('   done');

  // ── SUMMARY ──────────────────────────────────────────────────────────────
  console.log(`\n${'═'.repeat(58)}`);
  console.log(`  ✔ Inserted: ${inserted}`);
  console.log(`  ⊘ Skipped (duplicate / already exists): ${skipped}`);
  console.log(`${'═'.repeat(58)}\n`);
  console.log('Admin seed complete. All screens populated:');
  console.log('  • Dashboard  — varied loans, payments, users across all statuses');
  console.log('  • Users      — ACTIVE, PENDING, BLOCKED, FROZEN borrowers + lenders + company users');
  console.log('  • Verifications — 14 verifications (5 PENDING, 5 APPROVED, 1 REJECTED) + docs');
  console.log('  • Loans      — 5 new loans (ACTIVE×2, REPAID, DEFAULTED×2) + fees + schedules');
  console.log('  • Commissions — 8 configs (DRAFT/PENDING/APPROVED×3/REJECTED/INACTIVE) + workflow');
  console.log('  • Mgmt commissions — 5 entries per-company with lifecycle states');
  console.log('  • Companies  — 4 total, with lenders (6 links), agreements (6), auto-invest rules');
  console.log('  • Interest rates — 3 historical INACTIVE rate records');
  console.log('  • Marketplace — 7 loan requests (OPEN×2/BIDDING×2/FUNDED/ACTIVE/CANCELLED)');
  console.log('                   14 bids + 4 funding pools + 4 funding allocations');
  console.log('  • Payments   — 12 payments (COMPLETED×8, FAILED×2, PENDING×1 + deposit/fee)');
  console.log('  • Templates  — 14 email + 6 SMS + 10 notification templates');
  console.log('  • Platform   — 18 config keys + singleton platform_config row');
  console.log('  • Exports    — 8 exports (6 completed + 1 processing + 1 failed)');
  console.log('  • Retention  — 8 data_retention_queue entries (2 already due)');
  console.log('  • Audit logs — 22 admin actions across all entity types');
  console.log('  • Admin notifs — 8 notifications (5 unread) for admin + superadmin');
  console.log('  • Repayments — 29 repayment records (PAID/OVERDUE for defaulted loans)\n');

  await db.end();
}

main().catch(err => { console.error('Fatal error:', err); process.exit(1); });
