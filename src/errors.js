'use strict';

class WalletError extends Error {
  constructor(code, status, message) {
    super(message);
    this.code    = code;
    this.status  = status;
    this.message = message;
  }
}

class ValidationError extends WalletError {}
class AuthError       extends WalletError {}
class BusinessError   extends WalletError {}

class DuplicateError extends WalletError {
  constructor(response) {
    super(200, 'Success - duplicate request', 'duplicate');
    this.response = response;
  }
}

module.exports = { WalletError, ValidationError, AuthError, BusinessError, DuplicateError };
