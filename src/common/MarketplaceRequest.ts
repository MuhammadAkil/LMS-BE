/**
 * Extended Request Type for Marketplace
 * Adds custom properties attached by guards
 */
import { Request } from 'express';
import { LoanRequest } from '../domain/LoanRequest';
import { MarketplaceBid } from '../domain/MarketplaceBid';

export interface MarketplaceRequest extends Request {
    loanRequest?: LoanRequest;
    bid?: MarketplaceBid;
    companyId?: string;
    user?: any; // From authentication middleware
}
