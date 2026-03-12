import PDFDocument from 'pdfkit';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';

export interface LoanAgreementData {
  loanId: number;
  applicationId: number;
  borrowerName: string;
  borrowerEmail: string;
  borrowerBankAccount?: string;
  borrowerPesel?: string;
  borrowerAddress?: string;
  lenderName: string;
  lenderEmail: string;
  lenderBankAccount?: string;
  loanAmount: number;
  durationMonths?: number;
  durationDays?: number;
  interestRate: number;
  repaymentType: string;
  voluntaryCommission: number;
  portalCommission: number;
  disbursementDate: string;
  dueDate: string;
  repaymentSchedule?: Array<{
    installmentNumber: number;
    dueDate: string;
    totalAmount: number;
  }>;
}

export class PdfGenerationService {
  private outputDir: string;

  constructor() {
    this.outputDir = join(process.cwd(), 'generated_pdfs');
    if (!existsSync(this.outputDir)) {
      mkdirSync(this.outputDir, { recursive: true });
    }
  }

  /**
   * Generate a loan agreement PDF and return the file path.
   */
  async generateLoanAgreement(data: LoanAgreementData): Promise<string> {
    const fileName = `loan_agreement_${data.loanId}_${Date.now()}.pdf`;
    const filePath = join(this.outputDir, fileName);

    await new Promise<void>((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => {
        const { writeFileSync } = require('fs');
        writeFileSync(filePath, Buffer.concat(chunks));
        resolve();
      });
      doc.on('error', reject);

      this.buildAgreementContent(doc, data);
      doc.end();
    });

    return filePath;
  }

  /**
   * Generate PDF as a Buffer (for email attachment, no file write).
   */
  async generateLoanAgreementBuffer(data: LoanAgreementData): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      this.buildAgreementContent(doc, data);
      doc.end();
    });
  }

  private buildAgreementContent(doc: PDFKit.PDFDocument, data: LoanAgreementData): void {
    const formatCurrency = (amount: number) => `${amount.toFixed(2)} PLN`;
    const formatRate = (rate: number) => `${(rate * 100).toFixed(2)}%`;

    // Header
    doc.fontSize(20).font('Helvetica-Bold').text('UMOWA POŻYCZKI / LOAN AGREEMENT', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(10).font('Helvetica').text(`Nr umowy / Agreement No.: LA-${data.loanId}`, { align: 'center' });
    doc.moveDown(1);

    // Divider
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(0.5);

    // Parties
    doc.fontSize(13).font('Helvetica-Bold').text('1. STRONY UMOWY / PARTIES');
    doc.moveDown(0.5);
    doc.fontSize(10).font('Helvetica');
    doc.text(`Pożyczkobiorca / Borrower: ${data.borrowerName}`);
    doc.text(`Email: ${data.borrowerEmail}`);
    if (data.borrowerBankAccount) doc.text(`Rachunek bankowy / Bank Account: ${data.borrowerBankAccount}`);
    if (data.borrowerAddress) doc.text(`Adres / Address: ${data.borrowerAddress}`);
    if (data.borrowerPesel) doc.text(`PESEL: ${data.borrowerPesel}`);
    doc.moveDown(0.5);
    doc.text(`Pożyczkodawca / Lender: ${data.lenderName}`);
    doc.text(`Email: ${data.lenderEmail}`);
    if (data.lenderBankAccount) doc.text(`Rachunek bankowy / Bank Account: ${data.lenderBankAccount}`);
    doc.moveDown(1);

    // Loan Details
    doc.fontSize(13).font('Helvetica-Bold').text('2. WARUNKI POŻYCZKI / LOAN TERMS');
    doc.moveDown(0.5);
    doc.fontSize(10).font('Helvetica');
    doc.text(`Kwota pożyczki / Loan Amount: ${formatCurrency(data.loanAmount)}`);
    if (data.durationMonths) doc.text(`Okres / Duration: ${data.durationMonths} miesięcy / months`);
    if (data.durationDays) doc.text(`Okres / Duration: ${data.durationDays} dni / days`);
    doc.text(`Oprocentowanie roczne / Annual Interest Rate: ${formatRate(data.interestRate)}`);
    doc.text(`Typ spłaty / Repayment Type: ${data.repaymentType === 'LUMP_SUM' ? 'Jednorazowa / Lump Sum' : 'Raty / Installments'}`);
    doc.text(`Data wypłaty / Disbursement Date: ${data.disbursementDate}`);
    doc.text(`Data spłaty / Due Date: ${data.dueDate}`);
    doc.moveDown(1);

    // Commissions
    doc.fontSize(13).font('Helvetica-Bold').text('3. PROWIZJE / COMMISSIONS');
    doc.moveDown(0.5);
    doc.fontSize(10).font('Helvetica');
    doc.text(`Prowizja portalu / Portal Commission: ${formatCurrency(data.portalCommission)}`);
    doc.text(`Dobrowolna prowizja pożyczkodawcy / Voluntary Lender Commission: ${formatCurrency(data.voluntaryCommission)}`);
    doc.moveDown(1);

    // Repayment Schedule
    if (data.repaymentSchedule && data.repaymentSchedule.length > 0) {
      doc.fontSize(13).font('Helvetica-Bold').text('4. HARMONOGRAM SPŁAT / REPAYMENT SCHEDULE');
      doc.moveDown(0.5);
      doc.fontSize(9).font('Helvetica');

      // Table header
      const tableTop = doc.y;
      const col1 = 50, col2 = 150, col3 = 350;
      doc.font('Helvetica-Bold');
      doc.text('Nr / No.', col1, tableTop);
      doc.text('Termin / Due Date', col2, tableTop);
      doc.text('Kwota / Amount (PLN)', col3, tableTop);
      doc.moveDown(0.3);
      doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
      doc.moveDown(0.2);

      doc.font('Helvetica');
      for (const inst of data.repaymentSchedule) {
        const rowY = doc.y;
        doc.text(String(inst.installmentNumber), col1, rowY);
        doc.text(inst.dueDate, col2, rowY);
        doc.text(formatCurrency(inst.totalAmount), col3, rowY);
        doc.moveDown(0.3);
      }
      doc.moveDown(1);
    }

    // Legal Clauses
    doc.fontSize(13).font('Helvetica-Bold').text('5. POSTANOWIENIA OGÓLNE / GENERAL PROVISIONS');
    doc.moveDown(0.5);
    doc.fontSize(9).font('Helvetica');
    doc.text(
      'Pożyczkobiorca zobowiązuje się do terminowej spłaty pożyczki wraz z należnymi odsetkami. ' +
      'W przypadku opóźnienia w spłacie, pożyczkodawca ma prawo do naliczenia odsetek za zwłokę. ' +
      'Wypłata pożyczki oraz spłaty rat/całości pożyczki następują bezpośrednio między stronami niniejszej umowy ' +
      '(pożyczkobiorcą i pożyczkodawcą), bez pośrednictwa platformy. ' +
      'Niniejsza umowa została zawarta za pośrednictwem platformy pożyczkowej i jest prawnie wiążąca.',
      { align: 'justify' }
    );
    doc.moveDown(0.5);
    doc.text(
      'The borrower undertakes to repay the loan with applicable interest on time. ' +
      'In case of payment delay, the lender is entitled to charge late payment interest. ' +
      'Loan disbursement and repayments are executed directly between the contracting parties ' +
      '(borrower and lender), without the platform acting as a payment intermediary. ' +
      'This agreement has been concluded through the lending platform and is legally binding.',
      { align: 'justify' }
    );
    doc.moveDown(2);

    // Signatures
    doc.fontSize(11).font('Helvetica-Bold').text('PODPISY / SIGNATURES');
    doc.moveDown(1);
    doc.fontSize(10).font('Helvetica');

    const sigY = doc.y;
    doc.text('Pożyczkobiorca / Borrower:', 50, sigY);
    doc.text('Pożyczkodawca / Lender:', 300, sigY);
    doc.moveDown(2);

    const lineY = doc.y;
    doc.moveTo(50, lineY).lineTo(220, lineY).stroke();
    doc.moveTo(300, lineY).lineTo(470, lineY).stroke();
    doc.moveDown(0.3);
    doc.text(data.borrowerName, 50, doc.y);
    doc.text(data.lenderName, 300, doc.y - doc.currentLineHeight());
    doc.moveDown(1);

    // Footer
    doc.fontSize(8).fillColor('#666666').text(
      `Wygenerowano / Generated: ${new Date().toISOString()} | Platform Loan Agreement`,
      { align: 'center' }
    );
  }
}
