import { ExceptionCodes, ExceptionCodeDetails } from './ExceptionCodes';

export class CustomResponseStatusException extends Error {
  httpStatus!: number;
  statusCode!: string;
  statusMessage!: string;
  statusMessageDetail!: string;

  constructor(httpStatus: number, exceptionCode: ExceptionCodes) {
    const details = ExceptionCodeDetails[exceptionCode];
    super(details.statusMessage);
    this.httpStatus = httpStatus;
    this.statusCode = details.statusCode;
    this.statusMessage = details.statusMessage;
    this.statusMessageDetail = details.detail;
    this.name = 'CustomResponseStatusException';
  }
}
