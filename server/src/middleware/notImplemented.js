import { AppError } from '../lib/AppError.js';

export const NOT_IMPLEMENTED_MESSAGE = 'Ova funkcija još nije dostupna.';

/**
 * Handler for a documented route whose router is mounted but not built yet.
 * Passes 501 NOT_IMPLEMENTED to the error handler. Reads nothing from the
 * request, so no input is validated, stored or logged.
 */
export function notImplemented(_req, _res, next) {
  next(new AppError(501, 'NOT_IMPLEMENTED', NOT_IMPLEMENTED_MESSAGE));
}
