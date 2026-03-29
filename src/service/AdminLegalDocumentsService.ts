import { AppDataSource } from '../config/database';
import { LegalDocument } from '../domain/LegalDocument';
import { LegalDocumentVersion } from '../domain/LegalDocumentVersion';
import { LegalDocumentAssignment } from '../domain/LegalDocumentAssignment';
import { LegalDocumentAcceptance } from '../domain/LegalDocumentAcceptance';
import type {
    LegalDocumentDto,
    LegalDocumentVersionDto,
    LegalDocumentAssignmentDto,
    LegalDocumentAcceptanceLogDto,
    CreateLegalDocumentRequest,
    UpdateLegalDocumentRequest,
    CreateLegalDocumentVersionRequest,
    SetLegalDocumentAssignmentsRequest,
} from '../dto/LegalDocumentDtos';

const ROLE_ID_TO_USER_TYPE: Record<number, string> = {
    2: 'BORROWER',
    3: 'LENDER',
    4: 'COMPANY',
};

export class AdminLegalDocumentsService {
    async listDocuments(limit = 50, offset = 0): Promise<{ items: LegalDocumentDto[]; total: number }> {
        const repo = AppDataSource.getRepository(LegalDocument);
        const [items, total] = await repo.findAndCount({
            order: { updatedAt: 'DESC' },
            take: limit,
            skip: offset,
        });
        return {
            items: items.map((d) => this.toDocumentDto(d)),
            total,
        };
    }

    async getDocumentById(id: number): Promise<LegalDocumentDto & { assignments: LegalDocumentAssignmentDto[]; latestVersion?: LegalDocumentVersionDto }> {
        const docRepo = AppDataSource.getRepository(LegalDocument);
        const doc = await docRepo.findOne({ where: { id } });
        if (!doc) throw new Error('Document not found');
        const assignRepo = AppDataSource.getRepository(LegalDocumentAssignment);
        const assignments = await assignRepo.find({ where: { documentId: id } });
        const versionRepo = AppDataSource.getRepository(LegalDocumentVersion);
        const latest = await versionRepo.findOne({
            where: { documentId: id },
            order: { versionNumber: 'DESC' },
        });
        return {
            ...this.toDocumentDto(doc),
            assignments: assignments.map((a) => ({
                id: a.id,
                documentId: a.documentId,
                userType: a.userType as 'BORROWER' | 'LENDER' | 'COMPANY',
                mandatory: !!a.mandatory,
                createdAt: (a.createdAt as Date).toISOString(),
            })),
            latestVersion: latest ? this.toVersionDto(latest) : undefined,
        };
    }

    async createDocument(req: CreateLegalDocumentRequest): Promise<LegalDocumentDto> {
        const repo = AppDataSource.getRepository(LegalDocument);
        const doc = repo.create({
            name: req.name,
            typeCode: req.typeCode || 'CUSTOM',
        });
        await repo.save(doc);
        return this.toDocumentDto(doc);
    }

    async updateDocument(id: number, req: UpdateLegalDocumentRequest): Promise<LegalDocumentDto> {
        const repo = AppDataSource.getRepository(LegalDocument);
        const doc = await repo.findOne({ where: { id } });
        if (!doc) throw new Error('Document not found');
        if (req.name !== undefined) doc.name = req.name;
        if (req.typeCode !== undefined) doc.typeCode = req.typeCode;
        await repo.save(doc);
        return this.toDocumentDto(doc);
    }

    async deleteDocument(id: number): Promise<void> {
        const repo = AppDataSource.getRepository(LegalDocument);
        const doc = await repo.findOne({ where: { id } });
        if (!doc) throw new Error('Document not found');
        await repo.remove(doc);
    }

    async listVersions(documentId: number): Promise<LegalDocumentVersionDto[]> {
        const repo = AppDataSource.getRepository(LegalDocumentVersion);
        const list = await repo.find({
            where: { documentId },
            order: { versionNumber: 'DESC' },
        });
        return list.map((v) => this.toVersionDto(v));
    }

    async createVersion(documentId: number, req: CreateLegalDocumentVersionRequest): Promise<LegalDocumentVersionDto> {
        const docRepo = AppDataSource.getRepository(LegalDocument);
        const doc = await docRepo.findOne({ where: { id: documentId } });
        if (!doc) throw new Error('Document not found');
        const versionRepo = AppDataSource.getRepository(LegalDocumentVersion);
        const max = await versionRepo
            .createQueryBuilder('v')
            .select('MAX(v.versionNumber)', 'max')
            .where('v.documentId = :documentId', { documentId })
            .getRawOne<{ max: number | null }>();
        const versionNumber = (max?.max ?? 0) + 1;
        const version = versionRepo.create({
            documentId,
            versionNumber,
            content: req.content ?? null,
            filePath: req.filePath ?? null,
            effectiveFrom: new Date(req.effectiveFrom),
        });
        await versionRepo.save(version);
        return this.toVersionDto(version);
    }

    async setAssignments(documentId: number, req: SetLegalDocumentAssignmentsRequest): Promise<LegalDocumentAssignmentDto[]> {
        const docRepo = AppDataSource.getRepository(LegalDocument);
        const doc = await docRepo.findOne({ where: { id: documentId } });
        if (!doc) throw new Error('Document not found');
        const repo = AppDataSource.getRepository(LegalDocumentAssignment);
        await repo.delete({ documentId });
        const created: LegalDocumentAssignment[] = [];
        for (const a of req.assignments) {
            const assignment = repo.create({
                documentId,
                userType: a.userType,
                mandatory: a.mandatory ? 1 : 0,
            });
            await repo.save(assignment);
            created.push(assignment);
        }
        return created.map((a) => ({
            id: a.id,
            documentId: a.documentId,
            userType: a.userType as 'BORROWER' | 'LENDER' | 'COMPANY',
            mandatory: !!a.mandatory,
            createdAt: (a.createdAt as Date).toISOString(),
        }));
    }

    async getAcceptanceLogs(filters: {
        documentId?: number;
        userId?: number;
        limit?: number;
        offset?: number;
    }): Promise<{ items: LegalDocumentAcceptanceLogDto[]; total: number }> {
        const limit = filters.limit ?? 50;
        const offset = filters.offset ?? 0;
        const conditions: string[] = ['1=1'];
        const params: any[] = [];
        if (filters.documentId) {
            conditions.push('d.id = ?');
            params.push(filters.documentId);
        }
        if (filters.userId) {
            conditions.push('a.user_id = ?');
            params.push(filters.userId);
        }
        const whereClause = conditions.join(' AND ');
        const countRows = await AppDataSource.query(
            `SELECT COUNT(*) AS total FROM legal_document_acceptances a
             INNER JOIN legal_document_versions v ON v.id = a.document_version_id
             INNER JOIN legal_documents d ON d.id = v.document_id
             WHERE ${whereClause}`,
            params
        );
        const total = Number(countRows?.[0]?.total ?? 0);
        const rows = await AppDataSource.query(
            `SELECT a.id AS id, a.user_id AS userId, a.document_version_id AS versionId,
                    a.accepted_at AS acceptedAt, a.ip_address AS ipAddress,
                    v.version_number AS versionNumber, d.id AS documentId, d.name AS documentName,
                    u.email AS userEmail, u.first_name AS firstName, u.last_name AS lastName
             FROM legal_document_acceptances a
             INNER JOIN legal_document_versions v ON v.id = a.document_version_id
             INNER JOIN legal_documents d ON d.id = v.document_id
             LEFT JOIN users u ON u.id = a.user_id
             WHERE ${whereClause}
             ORDER BY a.accepted_at DESC
             LIMIT ? OFFSET ?`,
            [...params, limit, offset]
        );
        const items: LegalDocumentAcceptanceLogDto[] = (rows || []).map((r: any) => ({
            id: r.id,
            userId: r.userId,
            userEmail: r.userEmail,
            userName: [r.firstName, r.lastName].filter(Boolean).join(' ').trim() || r.userEmail,
            documentId: r.documentId,
            documentName: r.documentName,
            versionId: r.versionId,
            versionNumber: r.versionNumber,
            acceptedAt: r.acceptedAt,
            ipAddress: r.ipAddress,
        }));
        return { items, total };
    }

    private toDocumentDto(d: LegalDocument): LegalDocumentDto {
        return {
            id: d.id,
            name: d.name,
            typeCode: d.typeCode,
            createdAt: (d.createdAt as Date).toISOString(),
            updatedAt: (d.updatedAt as Date).toISOString(),
        };
    }

    private toVersionDto(v: LegalDocumentVersion): LegalDocumentVersionDto {
        return {
            id: v.id,
            documentId: v.documentId,
            versionNumber: v.versionNumber,
            content: v.content,
            filePath: v.filePath,
            effectiveFrom: (v.effectiveFrom as Date).toISOString(),
            createdAt: (v.createdAt as Date).toISOString(),
        };
    }
}

/** User-facing: get pending documents for a user (by role); accept a version */
export class LegalDocumentComplianceService {
    /** Map role_id to user type string */
    static roleIdToUserType(roleId: number): string {
        return ROLE_ID_TO_USER_TYPE[roleId] ?? '';
    }

    /** Pending = assigned to user's role, latest version not accepted by this user */
    async getPendingForUser(userId: number, roleId: number): Promise<Array<{
        documentId: number;
        documentName: string;
        typeCode: string;
        versionId: number;
        versionNumber: number;
        content: string | null;
        filePath: string | null;
        effectiveFrom: string;
        mandatory: boolean;
    }>> {
        const userType = LegalDocumentComplianceService.roleIdToUserType(roleId);
        if (!userType) return [];
        const raw = await AppDataSource.query(
            `SELECT d.id AS documentId, d.name AS documentName, d.type_code AS typeCode,
                    v.id AS versionId, v.version_number AS versionNumber, v.content, v.file_path AS filePath,
                    v.effective_from AS effectiveFrom, a.mandatory
             FROM legal_document_assignments a
             JOIN legal_documents d ON d.id = a.document_id
             JOIN legal_document_versions v ON v.document_id = d.id
             LEFT JOIN legal_document_acceptances acc ON acc.document_version_id = v.id AND acc.user_id = ?
             WHERE a.user_type = ?
               AND acc.id IS NULL
               AND v.id = (
                 SELECT id FROM legal_document_versions v2
                 WHERE v2.document_id = d.id
                 ORDER BY v2.version_number DESC LIMIT 1
               )
             ORDER BY a.mandatory DESC, d.name`,
            [userId, userType]
        );
        return (raw || []).map((r: any) => ({
            documentId: r.documentId,
            documentName: r.documentName,
            typeCode: r.typeCode,
            versionId: r.versionId,
            versionNumber: r.versionNumber,
            content: r.content,
            filePath: r.filePath,
            effectiveFrom: r.effectiveFrom,
            mandatory: !!r.mandatory,
        }));
    }

    async acceptDocument(userId: number, documentVersionId: number, ipAddress?: string | null): Promise<void> {
        const repo = AppDataSource.getRepository(LegalDocumentAcceptance);
        const existing = await repo.findOne({ where: { userId, documentVersionId } });
        if (existing) return;
        const versionRepo = AppDataSource.getRepository(LegalDocumentVersion);
        const version = await versionRepo.findOne({ where: { id: documentVersionId } });
        if (!version) throw new Error('Document version not found');
        const acc = repo.create({
            userId,
            documentVersionId,
            ipAddress: ipAddress ?? null,
        });
        await repo.save(acc);
    }

    /** Whether user has any pending mandatory document (for guard) */
    async hasPendingMandatory(userId: number, roleId: number): Promise<boolean> {
        const pending = await this.getPendingForUser(userId, roleId);
        return pending.some((p) => p.mandatory);
    }
}
