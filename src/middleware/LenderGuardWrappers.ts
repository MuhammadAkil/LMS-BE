import { Request, Response, NextFunction } from 'express';
import { LenderStatusGuard, LenderVerificationGuard } from './LenderGuards';

export const withLenderStatusGuard = (allowReadOnly: boolean = false) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const guard = await LenderStatusGuard(allowReadOnly);
    return guard(req, res, next);
  };
};

export const withLenderVerificationGuard = (requiredLevel: number = 0) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const guard = await LenderVerificationGuard(requiredLevel);
    return guard(req, res, next);
  };
};
