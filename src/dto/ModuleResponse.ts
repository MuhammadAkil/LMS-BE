import { StateMessages } from '../util/StateMessages';

export class ModuleResponse {
  statusCode?: string;
  statusMessage?: string;
  statusMessageDetail?: string;
  dist?: any;
  /** Alias for dist — matches what the Angular frontend reads as response.data */
  data?: any;
  pagination?: any;

  constructor(
    statusCode?: string,
    statusMessage?: string,
    dist?: any,
    pagination?: any,
    statusMessageDetail?: string
  ) {
    this.statusCode = statusCode;
    this.statusMessage = statusMessage;
    this.dist = dist;
    this.data = dist;
    this.pagination = pagination;
    this.statusMessageDetail = statusMessageDetail;
  }

  static generateSuccessResponse(dist?: any, pagination?: any): ModuleResponse {
    if (dist === undefined && pagination === undefined) {
      return new ModuleResponse('200', StateMessages.SUCCESS);
    }
    if (pagination === undefined) {
      return new ModuleResponse('200', StateMessages.SUCCESS, dist);
    }
    return new ModuleResponse('200', StateMessages.SUCCESS, dist, pagination);
  }

  static generateCustomResponse(status: number, message: string, dist?: any): ModuleResponse {
    if (dist === undefined) {
      return new ModuleResponse(String(status), message);
    }
    return new ModuleResponse(String(status), message, dist);
  }

  static generateNotFoundResponse(pagination?: any): ModuleResponse {
    if (pagination === undefined) {
      return new ModuleResponse('404', StateMessages.RECORD_NOT_FOUND);
    }
    return new ModuleResponse('404', StateMessages.RECORD_NOT_FOUND, null, pagination);
  }

  static generateServerErrorResponse(message?: string): ModuleResponse {
    return new ModuleResponse(
      '500',
      message || StateMessages.INTERNAL_SERVER_ERROR
    );
  }

  static generateCreateResponse(dist: any): ModuleResponse {
    return new ModuleResponse('201', StateMessages.SUCCESS, dist);
  }
}
