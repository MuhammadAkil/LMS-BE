import { Controller, Get, Param } from 'routing-controllers';
import { LookupService } from '../service/LookupService';
import { LookupItemDto } from '../service/LookupService';

/**
 * Lookup Controller
 * Registry-driven: all data from DB. Add new lookup table in DB + one entry in LOOKUP_REGISTRY.
 * - GET /lookup         -> all lookups keyed by name
 * - GET /lookup/:key    -> one lookup (e.g. /lookup/roles, /lookup/statuses)
 */
@Controller('/lookup')
export class LookupController {
  private readonly lookupService = new LookupService();

  /** GET /lookup – all lookups keyed by name. */
  @Get()
  async getAll(): Promise<Record<string, LookupItemDto[]>> {
    return this.lookupService.getAll();
  }

  @Get('/keys')
  async getKeys(): Promise<string[]> {
    return this.lookupService.getKeys();
  }

  @Get('/:key')
  async getByKey(@Param('key') key: string): Promise<LookupItemDto[]> {
    return this.lookupService.getByKey(key);
  }
}
