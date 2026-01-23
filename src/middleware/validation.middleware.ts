import { Request, Response, NextFunction } from 'express';
import { validate, ValidationError } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { ModuleResponse } from '../dto/ModuleResponse';
import { ExceptionCodes, ExceptionCodeDetails } from '../exception/ExceptionCodes';

export function validateRequest<T extends object>(
  dtoClass: new () => T,
  skipMissingProperties = false
) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const dto = plainToInstance(dtoClass, req.body);
    const errors: ValidationError[] = await validate(dto, { skipMissingProperties });

    if (errors.length > 0) {
      const messages = errors.map((error) => {
        return Object.values(error.constraints || {}).join(', ');
      });
      const response: ModuleResponse = {
        statusCode: ExceptionCodeDetails[ExceptionCodes.VALIDATION_FAILED].statusCode,
        statusMessage: ExceptionCodeDetails[ExceptionCodes.VALIDATION_FAILED].statusMessage,
        statusMessageDetail: messages.join('; '),
      };
      res.status(400).json(response);
      return;
    }

    req.body = dto;
    next();
  };
}
