import { AppError } from '../lib/AppError.js';

const GENERIC_MESSAGE = 'Invalid input.';

// Used for issues that have no message set on the schema itself, so Zod's
// default texts never reach the user. Schema-level messages still win.
const genericError = () => GENERIC_MESSAGE;

function messageFor(issue) {
  if (!issue) return GENERIC_MESSAGE;
  const field = issue.path.join('.');
  if (issue.message === GENERIC_MESSAGE && field) {
    return `Invalid value in field "${field}".`;
  }
  return issue.message;
}

/**
 * Validates `req[source]` with a Zod schema. The parsed value goes to
 * `req.valid[source]`; the original (e.g. `req.query`) is never modified.
 * On failure, passes a 400 VALIDATION_ERROR to the error handler.
 */
export function validate(schema, source = 'body') {
  return (req, _res, next) => {
    const result = schema.safeParse(req[source], { error: genericError });
    if (!result.success) {
      return next(
        new AppError(
          400,
          'VALIDATION_ERROR',
          messageFor(result.error.issues[0]),
        ),
      );
    }
    req.valid = { ...req.valid, [source]: result.data };
    return next();
  };
}
