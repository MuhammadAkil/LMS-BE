import { TemplateRepository } from '../repository/TemplateRepository';
import { AdminAuditService } from './AdminAuditService';
import { Template } from '../domain/Template';
import { TemplateDto, CreateTemplateRequest, UpdateTemplateRequest, DeprecateTemplateRequest } from '../dto/AdminDtos';

/**
 * Admin Templates Manager Service
 * Manages email, SMS, and notification templates
 */
export class AdminTemplatesService {
  private templateRepo: TemplateRepository;
  private auditService: AdminAuditService;

  constructor() {
    this.templateRepo = new TemplateRepository();
    this.auditService = new AdminAuditService();
  }

  /**
   * Get all active templates
   */
  async getAllTemplates(limit: number = 50, offset: number = 0) {
    const [templates, total] = await this.templateRepo.findAll(limit, offset);

    const dtos: TemplateDto[] = templates.map(t => this.mapToDto(t));

    return { data: dtos, total, limit, offset };
  }

  /**
   * Get all templates including deprecated ones
   */
  async getAllTemplatesIncludingDeprecated(limit: number = 50, offset: number = 0) {
    const [templates, total] = await this.templateRepo.findAllIncludingDeprecated(limit, offset);

    const dtos: TemplateDto[] = templates.map(t => this.mapToDto(t));

    return { data: dtos, total, limit, offset };
  }

  /**
   * Get template by ID
   */
  async getTemplateById(templateId: number): Promise<TemplateDto | null> {
    const template = await this.templateRepo.findById(templateId);
    if (!template) return null;

    return this.mapToDto(template);
  }

  /**
   * Get template by type and language
   * Returns active template only
   */
  async getTemplate(type: string, language: string): Promise<TemplateDto | null> {
    const template = await this.templateRepo.findByTypeAndLanguage(type, language);
    if (!template) return null;

    return this.mapToDto(template);
  }

  /**
   * Create new template
   */
  async createTemplate(request: CreateTemplateRequest, adminId: number): Promise<TemplateDto | null> {
    const template = new Template();
    template.type = request.type;
    template.language = request.language;
    template.content = request.content;
    template.subject = request.subject;
    template.deprecated = false;

    const saved = await this.templateRepo.save(template);

    // Audit log
    await this.auditService.logAction(
      adminId,
      'TEMPLATE_CREATED',
      'TEMPLATE',
      saved.id,
      {
        type: request.type,
        language: request.language,
      }
    );

    return this.mapToDto(saved);
  }

  /**
   * Update template
   */
  async updateTemplate(
    templateId: number,
    request: UpdateTemplateRequest,
    adminId: number
  ): Promise<TemplateDto | null> {
    const template = await this.templateRepo.findById(templateId);
    if (!template) {
      throw new Error('Template not found');
    }

    const oldContent = template.content;

    const updated = await this.templateRepo.update(templateId, {
      content: request.content || template.content,
      subject: request.subject || template.subject,
    });

    if (!updated) {
      throw new Error('Failed to update template');
    }

    // Audit log
    await this.auditService.logAction(
      adminId,
      'TEMPLATE_UPDATED',
      'TEMPLATE',
      templateId,
      {
        type: template.type,
        language: template.language,
        contentChanged: request.content !== undefined && request.content !== oldContent,
      }
    );

    return this.mapToDto(updated);
  }

  /**
   * Deprecate template
   * Soft delete - maintains history
   */
  async deprecateTemplate(
    templateId: number,
    request: DeprecateTemplateRequest,
    adminId: number
  ): Promise<TemplateDto | null> {
    const template = await this.templateRepo.findById(templateId);
    if (!template) {
      throw new Error('Template not found');
    }

    const deprecated = await this.templateRepo.deprecate(templateId);

    if (!deprecated) {
      throw new Error('Failed to deprecate template');
    }

    // Audit log
    await this.auditService.logAction(
      adminId,
      'TEMPLATE_DEPRECATED',
      'TEMPLATE',
      templateId,
      {
        type: template.type,
        language: template.language,
        reason: request.reason || 'No reason provided',
      }
    );

    return this.mapToDto(deprecated);
  }

  /**
   * Restore deprecated template
   */
  async restoreTemplate(templateId: number, adminId: number): Promise<TemplateDto | null> {
    const template = await this.templateRepo.findById(templateId);
    if (!template) {
      throw new Error('Template not found');
    }

    const restored = await this.templateRepo.restore(templateId);

    if (!restored) {
      throw new Error('Failed to restore template');
    }

    // Audit log
    await this.auditService.logAction(
      adminId,
      'TEMPLATE_RESTORED',
      'TEMPLATE',
      templateId,
      {
        type: template.type,
        language: template.language,
      }
    );

    return this.mapToDto(restored);
  }

  /**
   * Delete template permanently
   * Should only be done after deprecation period
   */
  async deleteTemplate(templateId: number, adminId: number, force: boolean = false): Promise<boolean> {
    const template = await this.templateRepo.findById(templateId);
    if (!template) {
      throw new Error('Template not found');
    }

    // Require deprecation first (unless forced)
    if (!force && !template.deprecated) {
      throw new Error('Template must be deprecated first');
    }

    const deleted = await this.templateRepo.delete(templateId);

    if (deleted) {
      // Audit log
      await this.auditService.logAction(
        adminId,
        'TEMPLATE_DELETED',
        'TEMPLATE',
        templateId,
        {
          type: template.type,
          language: template.language,
          force,
        }
      );
    }

    return deleted;
  }

  /**
   * Get template history for specific type
   */
  async getTemplateHistory(type: string, limit: number = 20) {
    const history = await this.templateRepo.findHistoryByType(type, limit);
    return history.map(t => this.mapToDto(t));
  }

  /**
   * Get templates by language
   */
  async getTemplatesByLanguage(language: string, limit: number = 50, offset: number = 0) {
    const [templates, total] = await this.templateRepo.findByLanguage(language, limit, offset);

    const dtos: TemplateDto[] = templates.map(t => this.mapToDto(t));

    return { data: dtos, total, limit, offset };
  }

  /**
   * Get templates by type
   */
  async getTemplatesByType(type: string, limit: number = 50, offset: number = 0) {
    const [templates, total] = await this.templateRepo.findByType(type, limit, offset);

    const dtos: TemplateDto[] = templates.map(t => this.mapToDto(t));

    return { data: dtos, total, limit, offset };
  }

  private mapToDto(template: Template): TemplateDto {
    return {
      id: template.id,
      type: template.type,
      language: template.language,
      content: template.content,
      subject: template.subject,
      deprecated: template.deprecated,
      deprecatedAt: template.deprecatedAt,
      createdAt: template.createdAt,
      updatedAt: template.updatedAt,
      name: `${template.type} (${template.language})`,
      lastModified: template.updatedAt,
    };
  }
}
