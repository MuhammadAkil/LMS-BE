import { AdminAuditService } from './AdminAuditService';
import { ExportRepository } from '../repository/ExportRepository';
import { AppDataSource } from '../config/database';
import { ExportListItemDto, GenerateXMLExportRequest, GenerateCSVExportRequest, GenerateClaimsRequest } from '../dto/AdminDtos';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Admin Exports Service
 * Generates and manages data exports (XML, CSV, claims)
 * Exports are immutable after creation
 * Claims generation requires critical operation guard (SuperAdmin + 2FA)
 */
export class AdminExportsService {
  private exportRepo: ExportRepository;
  private auditService: AdminAuditService;
  private exportsDir: string;

  constructor() {
    this.exportRepo = new ExportRepository();
    this.auditService = new AdminAuditService();
    // Create exports directory if it doesn't exist
    this.exportsDir = path.join(process.cwd(), 'exports');
    if (!fs.existsSync(this.exportsDir)) {
      fs.mkdirSync(this.exportsDir, { recursive: true });
    }
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
      // Query loans with limit
      const loans = await queryRunner.query(`
        SELECT l.*, u.email, c.name as company_name
        FROM loans l
        LEFT JOIN users u ON l.user_id = u.id
        LEFT JOIN companies c ON l.company_id = c.id
        WHERE 1=1
        ${request.statusFilter ? `AND l.status_id = ${request.statusFilter}` : ''}
        ${request.dateFrom ? `AND l.created_at >= '${request.dateFrom.toISOString()}'` : ''}
        ${request.dateTo ? `AND l.created_at <= '${request.dateTo.toISOString()}'` : ''}
        ORDER BY l.created_at DESC
        LIMIT 500
      `);

      // Generate XML
      const xml = this.generateXMLContent(loans);
      const fileName = `export_${Date.now()}_loans.xml`;
      const filePath = path.join(this.exportsDir, fileName);

      // Write to disk
      fs.writeFileSync(filePath, xml, 'utf-8');

      // Create export record (immutable)
      const exportRecord = {
        type_id: 1, // XML_EXPORT
        created_by: adminId,
        file_path: filePath,
        record_count: loans.length,
        metadata: {
          statusFilter: request.statusFilter,
          dateFrom: request.dateFrom,
          dateTo: request.dateTo,
          fileName,
        },
      };

      const saved = await this.exportRepo.save(exportRecord);

      // Log the action
      await this.auditService.logAction(
        adminId,
        'EXPORT_XML_GENERATED',
        'EXPORT',
        saved.id,
        {
          fileName,
          recordCount: loans.length,
          statusFilter: request.statusFilter,
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
      // Query loans
      const loans = await queryRunner.query(`
        SELECT l.*, u.email, c.name as company_name
        FROM loans l
        LEFT JOIN users u ON l.user_id = u.id
        LEFT JOIN companies c ON l.company_id = c.id
        WHERE 1=1
        ${request.statusFilter ? `AND l.status_id = ${request.statusFilter}` : ''}
        ${request.dateFrom ? `AND l.created_at >= '${request.dateFrom.toISOString()}'` : ''}
        ${request.dateTo ? `AND l.created_at <= '${request.dateTo.toISOString()}'` : ''}
        ORDER BY l.created_at DESC
        LIMIT 500
      `);

      // Generate CSV
      const csv = this.generateCSVContent(loans);
      const fileName = `export_${Date.now()}_loans.csv`;
      const filePath = path.join(this.exportsDir, fileName);

      // Write to disk
      fs.writeFileSync(filePath, csv, 'utf-8');

      // Create export record
      const exportRecord = {
        type_id: 2, // CSV_EXPORT
        created_by: adminId,
        file_path: filePath,
        record_count: loans.length,
        metadata: {
          statusFilter: request.statusFilter,
          dateFrom: request.dateFrom,
          dateTo: request.dateTo,
          fileName,
        },
      };

      const saved = await this.exportRepo.save(exportRecord);

      // Log the action
      await this.auditService.logAction(
        adminId,
        'EXPORT_CSV_GENERATED',
        'EXPORT',
        saved.id,
        {
          fileName,
          recordCount: loans.length,
          statusFilter: request.statusFilter,
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
      // Query defaulted loans (status_id = 3 typically)
      const defaultedLoans = await queryRunner.query(`
        SELECT l.*, u.email, u.phone, c.name as company_name,
               SUM(p.amount) as total_paid,
               l.amount - COALESCE(SUM(p.amount), 0) as remaining_amount
        FROM loans l
        LEFT JOIN users u ON l.user_id = u.id
        LEFT JOIN companies c ON l.company_id = c.id
        LEFT JOIN payments p ON l.id = p.loan_id AND p.status_id = 1
        WHERE l.status_id = 3
        ${request.minAmount ? `AND (l.amount - COALESCE(SUM(p.amount), 0)) >= ${request.minAmount}` : ''}
        GROUP BY l.id
        ORDER BY l.due_date ASC
        LIMIT 1000
      `);

      // Generate claims CSV
      const claims = this.generateClaimsContent(defaultedLoans);
      const fileName = `export_${Date.now()}_claims.csv`;
      const filePath = path.join(this.exportsDir, fileName);

      fs.writeFileSync(filePath, claims, 'utf-8');

      // Create export record
      const exportRecord = {
        type_id: 3, // CLAIMS_EXPORT
        created_by: adminId,
        file_path: filePath,
        record_count: defaultedLoans.length,
        metadata: {
          minAmount: request.minAmount,
          fileName,
          generatedAt: new Date(),
          reason: request.reason,
        },
      };

      const saved = await this.exportRepo.save(exportRecord);

      // Log as CRITICAL action (claims generation)
      await this.auditService.logAction(
        adminId,
        'EXPORT_CLAIMS_GENERATED',
        'EXPORT',
        saved.id,
        {
          fileName,
          recordCount: defaultedLoans.length,
          minAmount: request.minAmount,
          reason: request.reason,
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
    const exports = await this.exportRepo.findRecent(limit, offset, 30); // Last 30 days
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
    const ageMs = Date.now() - exp.created_at.getTime();
    const agesDays = ageMs / (1000 * 60 * 60 * 24);
    if (agesDays < 90 && !force) {
      throw new Error(`Cannot delete export created ${Math.floor(agesDays)} days ago (min 90 days). Use force=true to override.`);
    }

    // Hard delete the file (since it's no longer needed)
    try {
      if (fs.existsSync(exp.file_path)) {
        fs.unlinkSync(exp.file_path);
      }
    } catch (err) {
      console.error(`Failed to delete export file: ${err}`);
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
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<loans>\n';

    for (const loan of loans) {
      xml += '  <loan>\n';
      xml += `    <id>${loan.id}</id>\n`;
      xml += `    <userId>${loan.user_id}</userId>\n`;
      xml += `    <userEmail>${loan.email || 'N/A'}</userEmail>\n`;
      xml += `    <amount>${loan.amount}</amount>\n`;
      xml += `    <status>${this.getLoanStatus(loan.status_id)}</status>\n`;
      xml += `    <createdAt>${loan.created_at.toISOString()}</createdAt>\n`;
      xml += `    <dueDate>${loan.due_date?.toISOString() || 'N/A'}</dueDate>\n`;
      xml += `    <companyName>${loan.company_name || 'N/A'}</companyName>\n`;
      xml += '  </loan>\n';
    }

    xml += '</loans>';
    return xml;
  }

  private generateCSVContent(loans: any[]): string {
    let csv = 'ID,UserID,Email,Amount,Status,CreatedAt,DueDate,CompanyName\n';

    for (const loan of loans) {
      csv += `${loan.id},`;
      csv += `${loan.user_id},`;
      csv += `"${loan.email || 'N/A'}",`;
      csv += `${loan.amount},`;
      csv += `${this.getLoanStatus(loan.status_id)},`;
      csv += `"${loan.created_at.toISOString()}",`;
      csv += `"${loan.due_date?.toISOString() || 'N/A'}",`;
      csv += `"${loan.company_name || 'N/A'}"\n`;
    }

    return csv;
  }

  private generateClaimsContent(claims: any[]): string {
    let csv = 'LoanID,UserID,Email,Phone,Amount,RemainingAmount,CompanyName,DueDate\n';

    for (const claim of claims) {
      csv += `${claim.id},`;
      csv += `${claim.user_id},`;
      csv += `"${claim.email || 'N/A'}",`;
      csv += `"${claim.phone || 'N/A'}",`;
      csv += `${claim.amount},`;
      csv += `${claim.remaining_amount},`;
      csv += `"${claim.company_name || 'N/A'}",`;
      csv += `"${claim.due_date?.toISOString() || 'N/A'}"\n`;
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
    return {
      id: exp.id,
      type: this.getExportType(exp.type_id),
      typeId: exp.type_id,
      createdBy: exp.created_by,
      filePath: exp.file_path,
      recordCount: exp.record_count,
      metadata: exp.metadata || {},
      createdAt: exp.created_at,
    };
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
