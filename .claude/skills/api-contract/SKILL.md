---
name: api-contract
description: How to add or change an endpoint or response shape in BugHunter Arena - docs/API.md is the contract, Zod schemas enforce it at runtime, frontend mocks follow it. Use before adding an endpoint, renaming a field, changing an error code, or when client and server disagree about a payload.
---

# API contract

`docs/API.md` is the single source of truth for every request and response between `client/` and `server/`. Frontend and backend are often built in parallel by different people or agents; they only meet correctly if both build against the same document.

## Change protocol

Never change the implementation first and the doc afterwards.

1. **Consumer need.** Write down what the screen needs to render or do. Start from that, not from the database row.
2. **Change `docs/API.md`.** Request, response, status codes, error codes, nullability. Add or update a JSON example.
3. **Server schemas.** Update the Zod schemas in `server/src/schemas/` so they match the doc exactly. Response schemas too, not only request schemas.
4. **Mocks.** Update the mock responses in `client/src/api/mocks/` to the same JSON as the doc example.
5. **Implement** server and client.
6. **Verify** both sides against the contract (below) and run the e2e happy path.

An additive change (new optional field) is safe. Renaming or removing a field, changing a type, or making something nullable is breaking: update both sides in the same change.

## Conventions in this API

- Paths: plural nouns, kebab-case ids: `/api/challenges/find-max`, `/api/attempts/:id/evaluation`.
- JSON fields: camelCase in the API (`selectedLines`), snake_case in the database (`selected_lines`). Map at the boundary in `server/src/db/` or a serializer, never leak database rows directly.
- Status codes: `200` read/OK, `201` created, `400` validation, `404` not found, `409` state conflict, `413` too large, `429` rate limited, `500` unexpected.
- Errors: always `{ "error": { "code": "UPPER_SNAKE", "message": "Montenegrin, safe to show" } }`.
- Nullable fields are explicit `null`, never missing.
- Enums are lowercase strings and listed in the doc (`feedbackSource: "ai" | "fallback" | "demo"`).

## Runtime verification

Static agreement is not enough; serialized responses drift.

```js
// server/src/routes/challenges.js
import { ChallengePublicSchema } from '../schemas/challenge.js';

router.get('/:id', async (req, res, next) => {
  try {
    const challenge = await challengeService.getPublic(req.params.id);
    res.json(ChallengePublicSchema.parse(challenge)); // strips and checks the shape
  } catch (err) {
    next(err);
  }
});
```

Use `.strict()` on response schemas for anything that must not leak fields (the public challenge shape), so an extra field like `reference_solution` fails loudly in tests instead of reaching the browser.

Contract tests (Vitest + supertest) for each endpoint:

- success response parses with its response schema
- every documented error code is reachable and has the error shape
- alternate paths return the same shape: AI vs fallback vs demo evaluation

## Anti-patterns

- `res.json(row)` straight from Supabase.
- A field used by the frontend that is not in `docs/API.md`.
- Mock data in the client that the real server would never return.
- Two copies of a shape (doc says one thing, a hand-written object in the client another) with no check between them.

## Checklist

- [ ] `docs/API.md` updated first, with a JSON example
- [ ] Request and response Zod schemas match the doc
- [ ] Client mocks match the doc example
- [ ] Contract test for success and each error code
- [ ] AI, fallback and demo paths return the same shape
