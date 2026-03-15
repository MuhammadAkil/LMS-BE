/**
 * Available fields for company XML (and CSV) export.
 * Keys must match property names from getLoansForExport / portfolio loan rows.
 */
export interface CompanyExportFieldDef {
  key: string;
  label: string;
  description?: string;
}

export const COMPANY_EXPORT_FIELDS: CompanyExportFieldDef[] = [
  { key: 'loanId', label: 'Loan ID', description: 'Unique loan identifier' },
  { key: 'loanAmount', label: 'Loan Amount', description: 'Total loan amount' },
  { key: 'outstandingBalance', label: 'Outstanding Balance', description: 'Remaining balance' },
  { key: 'status', label: 'Status', description: 'Loan status (e.g. ACTIVE, DEFAULTED)' },
  { key: 'borrowerEmail', label: 'Borrower Email', description: 'Borrower contact email' },
  { key: 'borrowerLevel', label: 'Borrower Level', description: 'Trust/verification level' },
  { key: 'lenderEmail', label: 'Lender Email', description: 'Lender on whose behalf company manages' },
  { key: 'commissionAmount', label: 'Commission Amount', description: 'Commission for this loan' },
  { key: 'loanCreatedAt', label: 'Created At', description: 'Loan creation date' },
];

export const DEFAULT_XML_EXPORT_FIELDS = COMPANY_EXPORT_FIELDS.map((f) => f.key);
