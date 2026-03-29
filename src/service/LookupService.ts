import { EntityTarget } from 'typeorm';
import { AppDataSource } from '../config/database';
import { UserRole } from '../domain/UserRole';
import { UserStatus } from '../domain/UserStatus';
import { LoanStatus } from '../domain/LoanStatus';
import { LoanApplicationStatus } from '../domain/LoanApplicationStatus';
import { VerificationStatus } from '../domain/VerificationStatus';
import { VerificationType } from '../domain/VerificationType';
import { PaymentStatus } from '../domain/PaymentStatus';
import { PaymentType } from '../domain/PaymentType';
import { PaymentProvider } from '../domain/PaymentProvider';
import { ExportType } from '../domain/ExportType';

export interface LookupItemDto {
  id: number;
  code: string;
  name?: string;
  description?: string;
}

/**
 * Registry entry: one lookup table. Add new DB lookup tables here only.
 * Future: only update DB + add one line below; no new routes or frontend methods.
 */
export interface LookupRegistryEntry {
  key: string;
  entity: EntityTarget<unknown>;
  /** Property to use as display name (default 'name'). Use 'description' for VerificationType etc. */
  nameField?: 'name' | 'description';
}

/** Single source of truth: all lookup tables. Add new lookups here when you add a table in DB. */
export const LOOKUP_REGISTRY: LookupRegistryEntry[] = [
  { key: 'roles', entity: UserRole },
  { key: 'statuses', entity: UserStatus },
  { key: 'loan-statuses', entity: LoanStatus },
  { key: 'loan-application-statuses', entity: LoanApplicationStatus },
  { key: 'verification-statuses', entity: VerificationStatus },
  { key: 'verification-types', entity: VerificationType, nameField: 'description' },
  { key: 'payment-statuses', entity: PaymentStatus },
  { key: 'payment-types', entity: PaymentType },
  { key: 'payment-providers', entity: PaymentProvider },
  { key: 'export-types', entity: ExportType },
];

/**
 * Lookup Service
 * Registry-driven: all lookups come from DB. Add new lookup table in DB and one entry in LOOKUP_REGISTRY.
 */
export class LookupService {
  private mapRowToDto(row: Record<string, unknown>, nameField: 'name' | 'description'): LookupItemDto {
    const name = (row[nameField] as string) ?? (row.code as string);
    const dto: LookupItemDto = { id: row.id as number, code: row.code as string };
    if (name) dto.name = name;
    if (row.description) dto.description = row.description as string;
    return dto;
  }

  private async getByEntry(entry: LookupRegistryEntry): Promise<LookupItemDto[]> {
    const repo = AppDataSource.getRepository(entry.entity as EntityTarget<any>);
    const rows = await repo.find({ order: { id: 'ASC' } }) as Record<string, unknown>[];
    const nameField = entry.nameField ?? 'name';
    return rows.map((r) => this.mapRowToDto(r, nameField));
  }

  /** Get one lookup by key (e.g. 'roles', 'statuses'). Keys come from LOOKUP_REGISTRY. */
  async getByKey(key: string): Promise<LookupItemDto[]> {
    const entry = LOOKUP_REGISTRY.find((e) => e.key === key);
    if (!entry) {
      throw new Error(`Unknown lookup key: ${key}. Valid keys: ${LOOKUP_REGISTRY.map((e) => e.key).join(', ')}`);
    }
    return this.getByEntry(entry);
  }

  /** Get all lookups in one call. Returns { [key]: LookupItemDto[] }. */
  async getAll(): Promise<Record<string, LookupItemDto[]>> {
    const result: Record<string, LookupItemDto[]> = {};
    await Promise.all(
      LOOKUP_REGISTRY.map(async (entry) => {
        result[entry.key] = await this.getByEntry(entry);
      })
    );
    return result;
  }

  /** All valid lookup keys (for frontend/tooling). */
  getKeys(): string[] {
    return LOOKUP_REGISTRY.map((e) => e.key);
  }
}
