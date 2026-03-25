import { Request, Response, NextFunction } from 'express';
import { ValidationError } from 'class-validator';
import { HttpError } from 'routing-controllers';
import { ModuleResponse } from '../dto/ModuleResponse';
import { CustomResponseStatusException } from '../exception/CustomResponseStatusException';
import { ExceptionCodes, ExceptionCodeDetails } from '../exception/ExceptionCodes';
import multer from 'multer';

export function errorHandler(
  err: Error | CustomResponseStatusException | ValidationError[] | HttpError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (res.headersSent) {
    return;
  }
  console.log('Error:', err);

  // Handle routing-controllers HttpError (includes AuthorizationRequiredError)
  // Check for httpCode property which routing-controllers errors have
  if ((err as any).httpCode !== undefined) {
    const httpError = err as any;
    const httpCode = httpError.httpCode || 500;
    const message = httpError.message || 'Error';

    let statusMessage = message;
    let statusMessageDetail = message;

    if (httpCode === 401) {
      statusMessage = 'Unauthorized';
      statusMessageDetail = 'Authorization is required for this request';
    } else if (httpCode === 403) {
      statusMessage = 'Forbidden';
      statusMessageDetail = 'Access denied';
    }

    const response: ModuleResponse = {
      statusCode: String(httpCode),
      statusMessage: statusMessage,
      statusMessageDetail: statusMessageDetail,
    };
    res.status(httpCode).json(response);
    return;
  }

  // Also check if it's an HttpError instance
  if (err instanceof HttpError) {
    const httpCode = err.httpCode || 500;
    const message = err.message || 'Error';

    const response: ModuleResponse = {
      statusCode: String(httpCode),
      statusMessage: httpCode === 401 ? 'Unauthorized' : message,
      statusMessageDetail: httpCode === 401 ? 'Authorization is required for this request' : message,
    };
    res.status(httpCode).json(response);
    return;
  }

  if (err instanceof CustomResponseStatusException) {
    const response: ModuleResponse = {
      statusCode: err.statusCode,
      statusMessage: err.statusMessage,
      statusMessageDetail: err.statusMessageDetail,
    };
    res.status(err.httpStatus).json(response);
    return;
  }

  // Handle validation errors
  if (Array.isArray(err) && err.length > 0 && err[0] instanceof ValidationError) {
    const validationErrors = err as ValidationError[];
    const messages = validationErrors.map((error) => {
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

  if (err instanceof multer.MulterError) {
    const isSizeError = err.code === 'LIMIT_FILE_SIZE';
    const response: ModuleResponse = {
      statusCode: isSizeError ? '413' : '400',
      statusMessage: isSizeError ? 'Payload Too Large' : 'Bad Request',
      statusMessageDetail: isSizeError
        ? 'File size limit exceeded (max 10MB)'
        : err.message,
    };
    res.status(isSizeError ? 413 : 400).json(response);
    return;
  }

  if (typeof (err as any)?.message === 'string' && (err as any).message.includes('Unsupported file type')) {
    const response: ModuleResponse = {
      statusCode: '400',
      statusMessage: 'Bad Request',
      statusMessageDetail: (err as any).message,
    };
    res.status(400).json(response);
    return;
  }

  // Default error response
  const response: ModuleResponse = {
    statusCode: ExceptionCodeDetails[ExceptionCodes.INTERNAL_SERVER_ERROR].statusCode,
    statusMessage: ExceptionCodeDetails[ExceptionCodes.INTERNAL_SERVER_ERROR].statusMessage,
    statusMessageDetail: ExceptionCodeDetails[ExceptionCodes.INTERNAL_SERVER_ERROR].detail,
  };
  res.status(500).json(response);
}
