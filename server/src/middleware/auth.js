import { unauthorized, verifyAccessToken } from '../services/authService.js';

// Bearer scheme is case-insensitive (RFC 9110). Token: base64url/JWT chars.
const BEARER = /^bearer +([A-Za-z0-9\-._~+/]+=*) *$/i;
const MAX_TOKEN_LENGTH = 4096;

/**
 * The token from an Authorization header value. undefined if there is no
 * header, null if it is present but malformed.
 */
export function parseBearer(header) {
  if (header === undefined) return undefined;
  if (typeof header !== 'string' || header.length > MAX_TOKEN_LENGTH + 16) {
    return null;
  }
  const match = BEARER.exec(header);
  return match ? match[1] : null;
}

function authenticate(required) {
  return async (req, _res, next) => {
    try {
      const token = parseBearer(req.headers.authorization);
      if (token === undefined) {
        return required ? next(unauthorized()) : next();
      }
      if (token === null) return next(unauthorized());
      req.account = await verifyAccessToken(token);
      // Kept off req.account so it is never serialized with it. Never logged.
      req.accessToken = token;
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

/**
 * No header: guest (req.account stays undefined). A header that is present
 * but malformed, invalid or expired: 401. Never falls back to guest.
 */
export const optionalAuth = authenticate(false);

/** Like optionalAuth, but a missing header is also 401. */
export const requireAuth = authenticate(true);
