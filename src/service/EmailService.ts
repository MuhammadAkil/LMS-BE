import nodemailer from 'nodemailer';
import { LoanAgreementData } from './PdfGenerationService';

export interface EmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  attachments?: Array<{
    filename: string;
    content: Buffer;
    contentType: string;
  }>;
}

export class EmailService {
  private transporter: nodemailer.Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST ?? 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT ?? '587', 10),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER ?? '',
        pass: process.env.SMTP_PASS ?? '',
      },
    });
  }

  async sendEmail(options: EmailOptions): Promise<void> {
    const from = process.env.SMTP_FROM ?? 'noreply@lendingplatform.pl';

    await this.transporter.sendMail({
      from,
      to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
      attachments: options.attachments?.map(att => ({
        filename: att.filename,
        content: att.content,
        contentType: att.contentType,
      })),
    });
  }

  async sendLoanAgreementEmail(
    borrowerEmail: string,
    lenderEmail: string,
    data: LoanAgreementData,
    pdfBuffer: Buffer
  ): Promise<void> {
    const subject = `Umowa pożyczki / Loan Agreement - LA-${data.loanId}`;
    const fileName = `loan_agreement_${data.loanId}.pdf`;

    const html = this.buildAgreementEmailHtml(data);

    const recipients = [borrowerEmail, lenderEmail].filter(Boolean);

    await this.sendEmail({
      to: recipients,
      subject,
      html,
      attachments: [
        {
          filename: fileName,
          content: pdfBuffer,
          contentType: 'application/pdf',
        },
      ],
    });
  }

  async sendPaymentConfirmationEmail(
    to: string,
    paymentType: string,
    amount: number,
    loanId: number
  ): Promise<void> {
    const subject = `Potwierdzenie płatności / Payment Confirmation - Loan #${loanId}`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1890ff;">Potwierdzenie płatności / Payment Confirmation</h2>
        <p>Twoja płatność została zarejestrowana / Your payment has been processed:</p>
        <table style="width:100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd;"><strong>Typ / Type:</strong></td>
            <td style="padding: 8px; border: 1px solid #ddd;">${paymentType}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd;"><strong>Kwota / Amount:</strong></td>
            <td style="padding: 8px; border: 1px solid #ddd;">${amount.toFixed(2)} PLN</td>
          </tr>
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd;"><strong>Nr pożyczki / Loan No.:</strong></td>
            <td style="padding: 8px; border: 1px solid #ddd;">#${loanId}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd;"><strong>Data / Date:</strong></td>
            <td style="padding: 8px; border: 1px solid #ddd;">${new Date().toISOString()}</td>
          </tr>
        </table>
        <p style="color: #666; font-size: 12px; margin-top: 20px;">
          Lending Platform | Automated notification
        </p>
      </div>
    `;

    await this.sendEmail({ to, subject, html });
  }

  async sendApprovalNotificationEmail(
    to: string,
    entityType: string,
    entityId: number,
    status: string,
    comment?: string
  ): Promise<void> {
    const statusLabel = status === 'APPROVED' ? 'Zatwierdzono / Approved' : 'Odrzucono / Rejected';
    const subject = `${statusLabel} - ${entityType} #${entityId}`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: ${status === 'APPROVED' ? '#52c41a' : '#ff4d4f'};">${statusLabel}</h2>
        <p>Status zmiany: <strong>${entityType} #${entityId}</strong> został zmieniony na <strong>${status}</strong>.</p>
        ${comment ? `<p><strong>Komentarz / Comment:</strong> ${comment}</p>` : ''}
        <p style="color: #666; font-size: 12px; margin-top: 20px;">
          Lending Platform | Automated notification
        </p>
      </div>
    `;
    await this.sendEmail({ to, subject, html });
  }

  private buildAgreementEmailHtml(data: LoanAgreementData): string {
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1890ff;">Umowa pożyczki / Loan Agreement - LA-${data.loanId}</h2>
        <p>Szanowni Państwo / Dear Parties,</p>
        <p>
          W załączeniu przesyłamy umowę pożyczki nr <strong>LA-${data.loanId}</strong>.<br/>
          Please find attached loan agreement No. <strong>LA-${data.loanId}</strong>.
        </p>
        <table style="width:100%; border-collapse: collapse; margin: 20px 0;">
          <tr style="background: #f5f5f5;">
            <td style="padding: 8px; border: 1px solid #ddd;"><strong>Pożyczkobiorca / Borrower</strong></td>
            <td style="padding: 8px; border: 1px solid #ddd;">${data.borrowerName}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd;"><strong>Pożyczkodawca / Lender</strong></td>
            <td style="padding: 8px; border: 1px solid #ddd;">${data.lenderName}</td>
          </tr>
          <tr style="background: #f5f5f5;">
            <td style="padding: 8px; border: 1px solid #ddd;"><strong>Kwota / Amount</strong></td>
            <td style="padding: 8px; border: 1px solid #ddd;">${data.loanAmount.toFixed(2)} PLN</td>
          </tr>
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd;"><strong>Oprocentowanie / Interest Rate</strong></td>
            <td style="padding: 8px; border: 1px solid #ddd;">${(data.interestRate * 100).toFixed(2)}%</td>
          </tr>
          <tr style="background: #f5f5f5;">
            <td style="padding: 8px; border: 1px solid #ddd;"><strong>Data spłaty / Due Date</strong></td>
            <td style="padding: 8px; border: 1px solid #ddd;">${data.dueDate}</td>
          </tr>
        </table>
        <p>
          Prosimy o zapoznanie się z załączoną umową.<br/>
          Please review the attached agreement.
        </p>
        <p style="color: #666; font-size: 12px; margin-top: 20px;">
          Lending Platform | Automated notification — do not reply
        </p>
      </div>
    `;
  }
}
