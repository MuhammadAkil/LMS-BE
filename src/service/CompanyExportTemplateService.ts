import { CompanyExportTemplateRepository } from '../repository/CompanyExportTemplateRepository';
import { COMPANY_EXPORT_FIELDS, CompanyExportFieldDef, DEFAULT_XML_EXPORT_FIELDS } from '../util/CompanyExportFields';
import {
    CreateCompanyExportTemplateRequest,
    UpdateCompanyExportTemplateRequest,
    CompanyExportTemplateResponse,
} from '../dto/CompanyDtos';
import { CompanyExportTemplate } from '../domain/CompanyExportTemplate';

export class CompanyExportTemplateService {
    private readonly repo = new CompanyExportTemplateRepository();

    getAvailableFields(): CompanyExportFieldDef[] {
        return [...COMPANY_EXPORT_FIELDS];
    }

    getDefaultFieldKeys(): string[] {
        return [...DEFAULT_XML_EXPORT_FIELDS];
    }

    async listTemplates(companyId: number): Promise<CompanyExportTemplateResponse[]> {
        const list = await this.repo.findByCompanyId(companyId);
        return list.map((t) => ({
            id: t.id,
            name: t.name,
            fieldKeys: t.fieldKeys,
            createdAt: t.createdAt.toISOString(),
        }));
    }

    async getTemplate(companyId: number, templateId: number): Promise<CompanyExportTemplateResponse | null> {
        const t = await this.repo.findByCompanyAndId(companyId, templateId);
        if (!t) return null;
        return {
            id: t.id,
            name: t.name,
            fieldKeys: t.fieldKeys,
            createdAt: t.createdAt.toISOString(),
        };
    }

    async createTemplate(
        companyId: number,
        userId: number,
        body: CreateCompanyExportTemplateRequest
    ): Promise<CompanyExportTemplateResponse> {
        const allowed = new Set(COMPANY_EXPORT_FIELDS.map((f) => f.key));
        const fieldKeys = (body.fieldKeys || []).filter((k) => allowed.has(k));
        if (fieldKeys.length === 0) throw new Error('At least one valid field key is required');

        const t = new CompanyExportTemplate();
        t.companyId = companyId;
        t.name = body.name.trim();
        t.fieldKeys = fieldKeys;
        t.createdBy = userId;
        const saved = await this.repo.save(t);
        return {
            id: saved.id,
            name: saved.name,
            fieldKeys: saved.fieldKeys,
            createdAt: saved.createdAt.toISOString(),
        };
    }

    async updateTemplate(
        companyId: number,
        templateId: number,
        body: UpdateCompanyExportTemplateRequest
    ): Promise<CompanyExportTemplateResponse | null> {
        const t = await this.repo.findByCompanyAndId(companyId, templateId);
        if (!t) return null;

        if (body.name !== undefined) t.name = body.name.trim();
        if (body.fieldKeys !== undefined) {
            const allowed = new Set(COMPANY_EXPORT_FIELDS.map((f) => f.key));
            const fieldKeys = body.fieldKeys.filter((k) => allowed.has(k));
            if (fieldKeys.length === 0) throw new Error('At least one valid field key is required');
            t.fieldKeys = fieldKeys;
        }
        const saved = await this.repo.save(t);
        return {
            id: saved.id,
            name: saved.name,
            fieldKeys: saved.fieldKeys,
            createdAt: saved.createdAt.toISOString(),
        };
    }

    async deleteTemplate(companyId: number, templateId: number): Promise<boolean> {
        const t = await this.repo.findByCompanyAndId(companyId, templateId);
        if (!t) return false;
        return this.repo.delete(t.id);
    }

    /**
     * Resolve effective field keys: from template, or from provided array, or default.
     */
    async resolveFieldKeys(
        companyId: number,
        templateId?: number,
        fields?: string[]
    ): Promise<string[]> {
        if (templateId) {
            const t = await this.repo.findByCompanyAndId(companyId, templateId);
            if (t && t.fieldKeys.length) return t.fieldKeys;
        }
        if (fields && fields.length) {
            const allowed = new Set(COMPANY_EXPORT_FIELDS.map((f) => f.key));
            return fields.filter((k) => allowed.has(k));
        }
        return this.getDefaultFieldKeys();
    }
}
