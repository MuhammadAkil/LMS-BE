export enum ExceptionCodes {
  SCREEN_NAME_REQUIRED = 'SCREEN_NAME_REQUIRED',
  CUSTOMER_NOT_EXIST = 'CUSTOMER_NOT_EXIST',
  ELIGIBILITY_NOT_EXIST = 'ELIGIBILITY_NOT_EXIST',
  INVALID_FROM_AND_TO_DATE = 'INVALID_FROM_AND_TO_DATE',
  VALIDATION_FAILED = 'VALIDATION_FAILED',
  UNAUTHORIZED = 'UNAUTHORIZED',
  SUCCESS = 'SUCCESS',
  CREATED = 'CREATED',
  ACCESS_DENIED = 'ACCESS_DENIED',
  INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',
  NOT_FOUND = 'NOT_FOUND',
  INVALID_TOKEN = 'INVALID_TOKEN',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  TERMS_AND_CONDITIONS_NOT_ACCEPTED = 'TERMS_AND_CONDITIONS_NOT_ACCEPTED',
}

export const ExceptionCodeDetails: Record<ExceptionCodes, { statusCode: string; statusMessage: string; detail: string }> = {
  [ExceptionCodes.SCREEN_NAME_REQUIRED]: {
    statusCode: '400',
    statusMessage: 'Screen name is required',
    detail: 'Screen name is required',
  },
  [ExceptionCodes.CUSTOMER_NOT_EXIST]: {
    statusCode: '400',
    statusMessage: 'Some thing went wrong. Please contact to the administration',
    detail: 'Customer not exist',
  },
  [ExceptionCodes.ELIGIBILITY_NOT_EXIST]: {
    statusCode: '400',
    statusMessage: 'Some thing went wrong. Please contact to the administration',
    detail: 'Eligibility record not found for this customer',
  },
  [ExceptionCodes.INVALID_FROM_AND_TO_DATE]: {
    statusCode: '002',
    statusMessage: 'Invalid input parameters',
    detail: 'From date should be less than To Date',
  },
  [ExceptionCodes.VALIDATION_FAILED]: {
    statusCode: '400',
    statusMessage: 'Request validation fail. Please contact to the administration',
    detail: 'Validation Fail',
  },
  [ExceptionCodes.UNAUTHORIZED]: {
    statusCode: '401',
    statusMessage: 'Unauthorized',
    detail: 'Unauthorized',
  },
  [ExceptionCodes.SUCCESS]: {
    statusCode: '200',
    statusMessage: 'Success',
    detail: 'Request Success',
  },
  [ExceptionCodes.CREATED]: {
    statusCode: '201',
    statusMessage: 'Created',
    detail: 'Created',
  },
  [ExceptionCodes.ACCESS_DENIED]: {
    statusCode: '403',
    statusMessage: 'Some thing went wrong. Please contact to the administration',
    detail: 'Access is denied',
  },
  [ExceptionCodes.INTERNAL_SERVER_ERROR]: {
    statusCode: '500',
    statusMessage: 'Some thing went wrong. Please contact to the administration',
    detail: 'Internal Server Error',
  },
  [ExceptionCodes.NOT_FOUND]: {
    statusCode: '404',
    statusMessage: 'Something went wrong. Please contact to the administration',
    detail: 'Not Found',
  },
  [ExceptionCodes.INVALID_TOKEN]: {
    statusCode: '065',
    statusMessage: 'Invalid Token',
    detail: 'Invalid Token',
  },
  [ExceptionCodes.TOKEN_EXPIRED]: {
    statusCode: '066',
    statusMessage: 'Token Expired',
    detail: 'Token expired',
  },
  [ExceptionCodes.TERMS_AND_CONDITIONS_NOT_ACCEPTED]: {
    statusCode: '400',
    statusMessage: 'Please agree to the terms and conditions before proceeding.',
    detail: 'Accept Terms and conditions',
  },
};
