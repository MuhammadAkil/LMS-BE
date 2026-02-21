import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { AppDataSource } from '../config/database';
import { FileGenerationConfigRepository } from '../repository/FileGenerationConfigRepository';
import { ApprovalWorkflowService } from './ApprovalWorkflowService';
import { AdminAuditService } from './AdminAuditService';
import { ExportRepository } from '../repository/ExportRepository';

export interface FieldDefinition {
  field: string;       // DB column name or dot-path
  label: string;       // CSV header / XML tag name
  transform?: string;  // 'currency' | 'date' | 'percentage' | 'uppercase'
}

export interface GenerateFileRequest {
  configId?: number;           // Use saved config
  fileFormat?: 'XML' | 'CSV'; // Override format
  entityType?: string;         // Override entity type
  fieldConfig?: FieldDefinition[]; // Ad-hoc field config
  filters?: {
    dateFrom?: string;
    dateTo?: string;
    statusIds?: number[];
    loanIds?: number[];
  };
  limit?: number;
}

export class FileGenerationService {
  private configRepo: FileGenerationConfigRepository;
  private approvalService: ApprovalWorkflowService;
  private auditService: AdminAuditService;
  private exportRepo: ExportRepository;
  private outputDir: string;

  constructor() {
    this.configRepo = new FileGenerationConfigRepository();
    this.approvalService = new ApprovalWorkflowService();
    this.auditService = new AdminAuditService();
    this.exportRepo = new ExportRepository();
    this.outputDir = join(process.cwd(), 'exports');
    if (!existsSync(this.outputDir)) {
      mkdirSync(this.outputDir, { recursive: true });
    }
  }

  /**
   * Generate a file using a saved approved config or ad-hoc field config.
   */
  async generateFile(request: GenerateFileRequest, createdBy: number): Promise<{ filePath: string; recordCount: number; exportId: number }> {
    let fileFormat: string;
    let entityType: string;
    let fields: FieldDefinition[];

    if (request.configId) {
      const config = await this.configRepo.findById(request.configId);
      if (!config) throw new Error('File generation config not found');
      if (config.status !== 'APPROVED') throw new Error('File generation config is not approved');
      fileFormat = request.fileFormat ?? config.fileFormat;
      entityType = request.entityType ?? config.entityType;
      fields = config.fieldConfig as FieldDefinition[];
    } else {
      if (!request.fileFormat || !request.entityType || !request.fieldConfig?.length) {
        throw new Error('fileFormat, entityType, and fieldConfig are required when not using a saved config');
      }
      fileFormat = request.fileFormat;
      entityType = request.entityType;
      fields = request.fieldConfig;
    }

    const data = await this.fetchData(entityType, request.filters, request.limit ?? 500);
    const fileName = `export_${Date.now()}_${entityType.toLowerCase()}.${fileFormat.toLowerCase()}`;
    const filePath = join(this.outputDir, fileName);

    let content: string;
    if (fileFormat === 'XML') {
      content = this.buildXml(data, entityType, fields);
    } else {
      content = this.buildCsv(data, fields);
    }

    writeFileSync(filePath, content, 'utf-8');

    const typeId = fileFormat === 'XML' ? 1 : 2;
    const saved = await this.exportRepo.save({
      typeId,
      createdBy,
      filePath,
      recordCount: data.length,
      metadata: JSON.stringify({ entityType, fileFormat, fields: fields.map(f => f.field), filters: request.filters }),
    } as any);

    await this.auditService.logAction(createdBy, 'FILE_GENERATED', 'EXPORT', saved.id, {
      fileName, entityType, fileFormat, recordCount: data.length,
    });

    return { filePath, recordCount: data.length, exportId: saved.id };
  }

  /**
   * Create a new file generation config (starts as DRAFT, requires approval).
   */
  async createConfig(data: {
    name: string;
    fileFormat: 'XML' | 'CSV';
    entityType: string;
    fieldConfig: FieldDefinition[];
  }, createdBy: number) {
    const config = await this.configRepo.save({
      name: data.name,
      fileFormat: data.fileFormat,
      entityType: data.entityType,
      fieldConfig: data.fieldConfig,
      status: 'DRAFT',
      createdBy,
    });

    await this.auditService.logAction(createdBy, 'FILE_CONFIG_CREATED', 'FILE_CONFIG', config.id, data);
    return config;
  }

  async submitConfigForApproval(configId: number, actorId: number) {
    await this.approvalService.submitForApproval('FILE_CONFIG', configId, actorId);
    return await this.configRepo.findById(configId);
  }

  async approveConfig(configId: number, adminId: number) {
    await this.approvalService.approve('FILE_CONFIG', configId, adminId);
    return await this.configRepo.findById(configId);
  }

  async rejectConfig(configId: number, adminId: number, comment: string) {
    await this.approvalService.reject('FILE_CONFIG', configId, adminId, comment);
    return await this.configRepo.findById(configId);
  }

  async getAllConfigs(limit = 50, offset = 0) {
    const [configs, total] = await this.configRepo.findAll(limit, offset);
    return { data: configs, total };
  }

  async getApprovedConfigs() {
    return await this.configRepo.findApproved();
  }

  // ==================== Data Fetching ====================

  private async fetchData(entityType: string, filters?: GenerateFileRequest['filters'], limit = 500): Promise<any[]> {
    const safeLimit = Math.min(limit, 500);
    const conditions: string[] = ['1=1'];
    const params: any[] = [];

    if (filters?.dateFrom) {
      conditions.push('created_at >= ?');
      params.push(filters.dateFrom);
    }
    if (filters?.dateTo) {
      conditions.push('created_at <= ?');
      params.push(filters.dateTo);
    }
    if (filters?.statusIds?.length) {
      conditions.push(`status_id IN (${filters.statusIds.map(() => '?').join(',')})`);
      params.push(...filters.statusIds);
    }
    if (filters?.loanIds?.length) {
      conditions.push(`id IN (${filters.loanIds.map(() => '?').join(',')})`);
      params.push(...filters.loanIds);
    }

    const where = conditions.join(' AND ');

    switch (entityType.toUpperCase()) {
      case 'LOAN':
        return AppDataSource.query(
          `SELECT l.*, u.email as borrower_email, ls.code as status_name
           FROM loans l
           LEFT JOIN users u ON u.id = l.borrower_id
           LEFT JOIN loan_statuses ls ON ls.id = l.status_id
           WHERE ${where} ORDER BY l.created_at DESC LIMIT ?`,
          [...params, safeLimit]
        );
      case 'REPAYMENT':
        return AppDataSource.query(
          `SELECT r.*, l.borrower_id, u.email as borrower_email
           FROM repayments r
           LEFT JOIN loans l ON l.id = r.loan_id
           LEFT JOIN users u ON u.id = l.borrower_id
           WHERE ${where} ORDER BY r.due_date ASC LIMIT ?`,
          [...params, safeLimit]
        );
      case 'USER':
        return AppDataSource.query(
          `SELECT u.id, u.email, u.first_name, u.last_name, u.phone, u.level, u.status_id, u.created_at
           FROM users u WHERE ${where} ORDER BY u.created_at DESC LIMIT ?`,
          [...params, safeLimit]
        );
      case 'PAYMENT':
        return AppDataSource.query(
          `SELECT p.*, u.email as user_email, pt.code as payment_type, ps.code as status_name
           FROM payments p
           LEFT JOIN users u ON u.id = p.user_id
           LEFT JOIN payment_types pt ON pt.id = p.payment_type_id
           LEFT JOIN payment_statuses ps ON ps.id = p.status_id
           WHERE ${where} ORDER BY p.created_at DESC LIMIT ?`,
          [...params, safeLimit]
        );
      default:
        throw new Error(`Unsupported entity type: ${entityType}`);
    }
  }

  // ==================== File Builders ====================

  private buildCsv(data: any[], fields: FieldDefinition[]): string {
    const header = fields.map(f => `"${f.label}"`).join(',') + '\n';
    const rows = data.map(row => {
      return fields.map(f => {
        const value = this.getNestedValue(row, f.field);
        const transformed = this.applyTransform(value, f.transform);
        return `"${String(transformed ?? '').replace(/"/g, '""')}"`;
      }).join(',');
    }).join('\n');
    return header + rows;
  }

  private buildXml(data: any[], entityType: string, fields: FieldDefinition[]): string {
    const rootTag = entityType.toLowerCase() + 's';
    const itemTag = entityType.toLowerCase();

    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += `<${rootTag}>\n`;

    for (const row of data) {
      xml += `  <${itemTag}>\n`;
      for (const f of fields) {
        const value = this.getNestedValue(row, f.field);
        const transformed = this.applyTransform(value, f.transform);
        const safeValue = String(transformed ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        xml += `    <${f.label}>${safeValue}</${f.label}>\n`;
      }
      xml += `  </${itemTag}>\n`;
    }

    xml += `</${rootTag}>`;
    return xml;
  }

  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((acc, key) => acc?.[key], obj);
  }

  private applyTransform(value: any, transform?: string): any {
    if (value === null || value === undefined) return '';
    switch (transform) {
      case 'currency':
        return typeof value === 'number' ? value.toFixed(2) : value;
      case 'date':
        return value instanceof Date ? value.toISOString().split('T')[0] : String(value).split('T')[0];
      case 'percentage':
        return typeof value === 'number' ? `${(value * 100).toFixed(2)}%` : value;
      case 'uppercase':
        return String(value).toUpperCase();
      default:
        return value;
    }
  }
}
