/**
 * An error with an HTTP status and a code from docs/API.md.
 * `message` is shown to the user, so it must be plain English and safe.
 * Pass `{ cause }` to keep the original error for the logs.
 */
export class AppError extends Error {
  constructor(status, code, message, options) {
    super(message, options);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
  }
}
