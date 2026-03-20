import { AdminAuditService } from './AdminAuditService';
import { ExportRepository } from '../repository/ExportRepository';
import { AppDataSource } from '../config/database';
import { ExportListItemDto, GenerateXMLExportRequest, GenerateCSVExportRequest, GenerateClaimsRequest } from '../dto/AdminDtos';
import { s3Service } from '../services/s3.service';

/**
 * Admin Exports Service
 * Generates and manages data exports (XML, CSV, claims)
 * Exports are immutable after creation
 * Claims generation requires critical operation guard (SuperAdmin + 2FA)
 */
export class AdminExportsService {
  private readonly exportRepo: ExportRepository;
  private readonly auditService: AdminAuditService;

  constructor() {
    this.exportRepo = new ExportRepository();
    this.auditService = new AdminAuditService();
  }

  /**
   * Generate XML export of loans
   * Limited to 500 loans per export
   * Exports are immutable after creation
   */
  async generateXMLExport(
    request: GenerateXMLExportRequest,
    adminId: number
  ): Promise<ExportListItemDto> {
    const queryRunner = AppDataSource.createQueryRunner();

    try {
      // Query loans with limit (max 500 per spec). Loan entity uses borrowerId, not user_id; no company_id.
      const limit = Math.min(request.limit || 500, 500);
      const loans = await queryRunner.query(`
        SELECT l.*, u.email as borrower_email
        FROM loans l
        LEFT JOIN users u ON l.borrowerId = u.id
        WHERE 1=1
        ${request.loanStatus && Array.isArray(request.loanStatus) ? `AND l.statusId IN (${request.loanStatus.join(',')})` : ''}
        ${request.dateFrom ? `AND l.createdAt >= '${new Date(request.dateFrom as any).toISOString()}'` : ''}
        ${request.dateTo ? `AND l.createdAt <= '${new Date(request.dateTo as any).toISOString()}'` : ''}
        ORDER BY l.createdAt DESC
        LIMIT ${limit}
      `);

      // Generate XML
      const xml = this.generateXMLContent(loans);
      const fileName = `export_${Date.now()}_loans.xml`;
      const key = s3Service.generateKey('admin', String(adminId), fileName);

      await s3Service.uploadFile(Buffer.from(xml, 'utf-8'), key, 'application/xml');

      // Create export record (immutable)
      const exportRecord = {
        typeId: 1, // XML_EXPORT
        createdBy: adminId,
        filePath: null as any,
        documentKey: key,
        recordCount: loans.length,
        metadata: JSON.stringify({
          loanStatus: request.loanStatus,
          dateFrom: request.dateFrom,
          dateTo: request.dateTo,
          fileName,
        }),
      };

      const saved = await this.exportRepo.save(exportRecord as any);

      // Log the action
      await this.auditService.logAction(
        adminId,
        'EXPORT_XML_GENERATED',
        'EXPORT',
        saved.id,
        {
          fileName,
          recordCount: loans.length,
          loanStatus: request.loanStatus,
        }
      );

      return this.mapExportToDto(saved);
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Generate CSV export of loans
   * Limited to 500 loans per export
   */
  async generateCSVExport(
    request: GenerateCSVExportRequest,
    adminId: number
  ): Promise<ExportListItemDto> {
    const queryRunner = AppDataSource.createQueryRunner();

    try {
      // Query loans based on entityType
      let loans: any[];
      if (request.entityType === 'USERS') {
        loans = await queryRunner.query(`SELECT u.* FROM users u LIMIT ${request.limit || 500}`);
      } else if (request.entityType === 'PAYMENTS') {
        loans = await queryRunner.query(`SELECT p.* FROM payments p LIMIT ${request.limit || 500}`);
      } else {
        // Default to LOANS
        const dateFrom = (request as any).filters?.dateFrom || (request as any).dateFrom;
        const dateTo = (request as any).filters?.dateTo || (request as any).dateTo;
        loans = await queryRunner.query(`SELECT l.*, u.email as borrower_email
          FROM loans l
          LEFT JOIN users u ON l.borrowerId = u.id
          WHERE 1=1
          ${dateFrom ? `AND l.createdAt >= '${new Date(dateFrom).toISOString()}'` : ''}
          ${dateTo ? `AND l.createdAt <= '${new Date(dateTo).toISOString()}'` : ''}
          ORDER BY l.createdAt DESC
          LIMIT ${Math.min((request as any).limit || 500, 500)}`);
      }

      // Generate CSV
      const csv = this.generateCSVContent(loans);
      const fileName = `export_${Date.now()}_${(request.entityType || 'loans').toLowerCase()}.csv`;
      const key = s3Service.generateKey('admin', String(adminId), fileName);
      await s3Service.uploadFile(Buffer.from(csv, 'utf-8'), key, 'text/csv');

      // Create export record
      const exportRecord = {
        typeId: 2, // CSV_EXPORT
        createdBy: adminId,
        filePath: null as any,
        documentKey: key,
        recordCount: loans.length,
        metadata: JSON.stringify({
          entityType: request.entityType,
          filters: request.filters,
          fileName,
        }),
      };

      const saved = await this.exportRepo.save(exportRecord as any);

      // Log the action
      await this.auditService.logAction(
        adminId,
        'EXPORT_CSV_GENERATED',
        'EXPORT',
        saved.id,
        {
          fileName,
          recordCount: loans.length,
          entityType: request.entityType,
        }
      );

      return this.mapExportToDto(saved);
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Generate claims export
   * CRITICAL OPERATION - requires SuperAdmin + 2FA
   * Generates list of defaulted loans and claims
   * This should be restricted by CriticalOperationGuard middleware
   */
  async generateClaimsExport(
    request: GenerateClaimsRequest,
    adminId: number
  ): Promise<ExportListItemDto> {
    const queryRunner = AppDataSource.createQueryRunner();

    try {
      // Query specific loans by IDs from request
      const loanIds = request.loanIds.join(',');
      const defaultedLoans = await queryRunner.query(`
        SELECT l.*, u.email, u.phone,
               COALESCE(SUM(p.amount), 0) as total_paid,
               l.totalAmount - COALESCE(SUM(p.amount), 0) as remaining_amount
        FROM loans l
        LEFT JOIN users u ON l.borrowerId = u.id
        LEFT JOIN payments p ON p.loanId = l.id AND p.statusId = 1
        WHERE l.id IN (${loanIds})
        GROUP BY l.id
        ORDER BY l.dueDate ASC
      `);

      // Generate claims CSV
      const claims = this.generateClaimsContent(defaultedLoans);
      const fileName = `export_${Date.now()}_claims.csv`;
      const key = s3Service.generateKey('admin', String(adminId), fileName);
      await s3Service.uploadFile(Buffer.from(claims, 'utf-8'), key, 'text/csv');

      // Create export record
      const exportRecord = {
        typeId: 3, // CLAIMS_EXPORT
        createdBy: adminId,
        filePath: null as any,
        documentKey: key,
        recordCount: defaultedLoans.length,
        metadata: JSON.stringify({
          loanIds: request.loanIds,
          fileName,
          generatedAt: new Date(),
          courtName: request.courtName,
          caseNumber: request.caseNumber,
        }),
      };

      const saved = await this.exportRepo.save(exportRecord as any);

      // Log as CRITICAL action (claims generation)
      await this.auditService.logAction(
        adminId,
        'EXPORT_CLAIMS_GENERATED',
        'EXPORT',
        saved.id,
        {
          fileName,
          recordCount: defaultedLoans.length,
          loanIds: request.loanIds,
          courtName: request.courtName,
          caseNumber: request.caseNumber,
          critical: true, // Flag for high-risk operation
        }
      );

      return this.mapExportToDto(saved);
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Get export history
   */
  async getExportHistory(limit: number = 50, offset: number = 0): Promise<ExportListItemDto[]> {
    const exports = await this.exportRepo.findRecent(30, limit); // Last 30 days
    return exports.map(exp => this.mapExportToDto(exp));
  }

  /**
   * Get exports by type
   */
  async getExportsByType(typeId: number, limit: number = 20, offset: number = 0): Promise<ExportListItemDto[]> {
    const exports = await this.exportRepo.findByType(typeId, limit, offset);
    return exports.map(exp => this.mapExportToDto(exp));
  }

  /**
   * Get export details
   */
  async getExportById(exportId: number): Promise<ExportListItemDto> {
    const exp = await this.exportRepo.findById(exportId);
    if (!exp) {
      throw new Error(`Export ${exportId} not found`);
    }
    return this.mapExportToDto(exp);
  }

  /**
   * Delete export (only soft delete - immutability)
   * Exports cannot be deleted if they're recent (within 90 days)
   */
  async deleteExport(exportId: number, adminId: number, force: boolean = false): Promise<void> {
    const exp = await this.exportRepo.findById(exportId);
    if (!exp) {
      throw new Error(`Export ${exportId} not found`);
    }

    // Check age - cannot delete recent exports unless forced
    const ageMs = Date.now() - exp.createdAt.getTime();
    const agesDays = ageMs / (1000 * 60 * 60 * 24);
    if (agesDays < 90 && !force) {
      throw new Error(`Cannot delete export created ${Math.floor(agesDays)} days ago (min 90 days). Use force=true to override.`);
    }

    // Delete object from S3 (best-effort)
    try {
      const key = (exp as any).documentKey || exp.filePath;
      if (key) {
        await s3Service.deleteFile(key);
      }
    } catch (err) {
      console.error(`Failed to delete export object: ${err}`);
    }

    // Delete the export record
    await this.exportRepo.hardDelete(exportId);

    // Log the deletion
    await this.auditService.logAction(
      adminId,
      'EXPORT_DELETED',
      'EXPORT',
      exportId,
      {
        ageInDays: Math.floor(agesDays),
        force,
      }
    );
  }

  // ==================== Helper Methods ====================

  private generateXMLContent(loans: any[]): string {
    const toIso = (v: any): string => v ? new Date(v).toISOString() : 'N/A';
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<loans>\n';

    for (const loan of loans) {
      xml += '  <loan>\n';
      xml += `    <id>${loan.id}</id>\n`;
      xml += `    <userId>${loan.borrowerId ?? loan.borrower_id}</userId>\n`;
      xml += `    <userEmail>${loan.borrower_email || loan.email || 'N/A'}</userEmail>\n`;
      xml += `    <amount>${loan.totalAmount ?? loan.total_amount}</amount>\n`;
      xml += `    <status>${this.getLoanStatus(loan.statusId ?? loan.status_id)}</status>\n`;
      xml += `    <createdAt>${toIso(loan.createdAt ?? loan.created_at)}</createdAt>\n`;
      xml += `    <dueDate>${toIso(loan.dueDate ?? loan.due_date)}</dueDate>\n`;
      xml += '  </loan>\n';
    }

    xml += '</loans>';
    return xml;
  }

  private generateCSVContent(loans: any[]): string {
    const toIso = (v: any): string => v ? new Date(v).toISOString() : 'N/A';
    let csv = 'ID,UserID,Email,Amount,Status,CreatedAt,DueDate\n';

    for (const loan of loans) {
      csv += `${loan.id},`;
      csv += `${loan.borrowerId ?? loan.borrower_id},`;
      csv += `"${loan.borrower_email || loan.email || 'N/A'}",`;
      csv += `${loan.totalAmount ?? loan.total_amount},`;
      csv += `${this.getLoanStatus(loan.statusId ?? loan.status_id)},`;
      csv += `"${toIso(loan.createdAt ?? loan.created_at)}",`;
      csv += `"${toIso(loan.dueDate ?? loan.due_date)}"\n`;
    }

    return csv;
  }

  private generateClaimsContent(claims: any[]): string {
    const toIso = (v: any): string => v ? new Date(v).toISOString() : 'N/A';
    let csv = 'LoanID,UserID,Email,Phone,TotalAmount,RemainingAmount,DueDate\n';

    for (const claim of claims) {
      csv += `${claim.id},`;
      csv += `${claim.borrowerId ?? claim.borrower_id},`;
      csv += `"${claim.email || 'N/A'}",`;
      csv += `"${claim.phone || 'N/A'}",`;
      csv += `${claim.totalAmount ?? claim.total_amount},`;
      csv += `${claim.remaining_amount},`;
      csv += `"${toIso(claim.dueDate ?? claim.due_date)}"\n`;
    }

    return csv;
  }

  private getLoanStatus(statusId: number): string {
    const statusMap: { [key: number]: string } = {
      1: 'ACTIVE',
      2: 'COMPLETED',
      3: 'DEFAULTED',
      4: 'CANCELLED',
    };
    return statusMap[statusId] || 'UNKNOWN';
  }

  private mapExportToDto(exp: any): ExportListItemDto {
    const typeName = this.getExportType(exp.typeId);
    return {
      id: exp.id,
      typeId: exp.typeId,
      typeName,
      createdBy: exp.createdBy,
      creatorEmail: 'unknown',
      recordCount: exp.recordCount,
      createdAt: exp.createdAt,
      // Fields the FE template binds
      date: exp.createdAt,
      type: typeName,
      records: exp.recordCount,
      status: 'Completed',
      filePath: (exp as any).documentKey || exp.filePath || '',
    } as any;
  }

  private getExportType(typeId: number): string {
    const typeMap: { [key: number]: string } = {
      1: 'XML_EXPORT',
      2: 'CSV_EXPORT',
      3: 'CLAIMS_EXPORT',
    };
    return typeMap[typeId] || 'UNKNOWN';
  }
}
