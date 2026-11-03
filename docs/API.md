# BugHunter Arena - API contract

Base path `/api`. All bodies are JSON. The server runs on `http://localhost:3000` in development.

Grading happens in two calls: `POST /api/attempts` locks the answer and only then returns all tests and the reference solution; the browser runs them and sends results to `POST /api/attempts/:id/evaluation`, which returns the score.

## Endpoints

| Method | Path | Purpose | Priority |
| --- | --- | --- | --- |
| GET | `/api/health` | Server status and AI availability | Must |
| GET | `/api/challenges` | Challenge list, no solutions or hidden tests | Must |
| GET | `/api/challenges/:id` | Description, code and visible tests | Must |
| POST | `/api/challenges/:id/hints` | Next hint (level 1-3) | Should |
| POST | `/api/attempts` | Submit answer; returns attempt id, all tests, reference solution | Must |
| POST | `/api/attempts/:id/evaluation` | Test results in; score and feedback out | Must |
| GET | `/api/progress?userId=` | Dashboard statistics | Should |
| GET | `/api/attempts?userId=&challengeId=` | Attempt history | Could |
| POST | `/api/users` | Create a user with a display name | Could |

## GET /api/health

```json
{ "status": "ok", "ai": "available", "demoMode": false }
```

`ai` is `available`, `unavailable` or `demo`.

## GET /api/challenges

```json
[
  {
    "id": "find-max",
    "title": "Najveći element liste",
    "language": "python",
    "difficulty": "lako",
    "bugCategory": "Pogrešna inicijalizacija"
  }
]
```

## GET /api/challenges/:id

Never includes `reference_solution`, `bug_lines`, `related_lines`, `bug_description`, `keywords_json`, `hints_json`, `fallback_feedback` or hidden tests.

```json
{
  "id": "find-max",
  "title": "Najveći element liste",
  "description": "Funkcija find_max vraća najveći broj iz liste. Za praznu listu vraća None.",
  "language": "python",
  "difficulty": "lako",
  "bugCategory": "Pogrešna inicijalizacija",
  "functionName": "find_max",
  "code": "def find_max(numbers):\n    max_value = 0\n    for number in numbers:\n        if number > max_value:\n            max_value = number\n    return max_value",
  "visibleTests": [
    { "id": "t1", "args": [[2, 5, 1]], "expected": 5 },
    { "id": "t2", "args": [[7]], "expected": 7 }
  ],
  "hintCount": 3
}
```

## POST /api/challenges/:id/hints

Request:

```json
{ "level": 1, "currentAnswer": { "selectedLines": [], "explanation": "" } }
```

Response:

```json
{ "level": 1, "hint": "Da li funkcija radi za svaku listu brojeva, ili samo za uobičajene?", "source": "ai" }
```

`source` is `ai` or `written`. `level` must be one more than the hints already used.

## POST /api/attempts

Request:

```json
{
  "challengeId": "find-max",
  "userId": null,
  "selectedLines": [2],
  "explanation": "max_value počinje od 0. Ako su svi brojevi negativni, nijedan nije veći od 0, pa funkcija vraća 0, a 0 nije u listi.",
  "edgeCase": { "args": [[-8, -3, -10]], "expected": -3 },
  "fixedCode": "def find_max(numbers):\n    if not numbers:\n        return None\n    max_value = numbers[0]\n    ...",
  "hintsUsed": 1,
  "durationSec": 184
}
```

Validation: `selectedLines` 1-10 positive integers; `explanation` 20-1000 chars; `fixedCode` up to 5000 chars; `hintsUsed` 0-3; `durationSec` >= 0.

Response `201 Created`:

```json
{
  "attemptId": "a3f1c2d4-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
  "tests": [
    { "id": "t1", "args": [[2, 5, 1]], "expected": 5, "visible": true },
    { "id": "t2", "args": [[7]], "expected": 7, "visible": true },
    { "id": "t3", "args": [[-8, -3, -10]], "expected": -3, "visible": false },
    { "id": "t4", "args": [[]], "expected": null, "visible": false }
  ],
  "referenceSolution": "def find_max(numbers): ..."
}
```

## POST /api/attempts/:id/evaluation

Request. `edgeCaseCheck` holds what the original code and the reference solution return for the student's edge-case input; `null` output plus `error` if it raised.

```json
{
  "testResults": [
    { "id": "t1", "passed": true, "actual": 5 },
    { "id": "t2", "passed": true, "actual": 7 },
    { "id": "t3", "passed": true, "actual": -3 },
    { "id": "t4", "passed": true, "actual": null }
  ],
  "edgeCaseCheck": { "originalOutput": 0, "referenceOutput": -3, "error": null }
}
```

A test that times out is `{ "id": "t3", "passed": false, "actual": null, "error": "timeout" }`.

Response `200 OK`:

```json
{
  "score": 89,
  "breakdown": { "lineIdentification": 40, "explanation": 24, "edgeCase": 20, "fix": 10, "hintPenalty": -5 },
  "testsPassed": 4,
  "testsTotal": 4,
  "feedbackSource": "ai",
  "feedback": {
    "is_correct": true,
    "explanation_quality": 8,
    "detected_misconception": "Pretpostavka da lista uvijek sadrži bar jedan pozitivan broj.",
    "needs_clarification": false,
    "hint": null,
    "feedback": "Tačno si prepoznao da početna vrijednost 0 pravi problem kada su svi brojevi negativni. Dobro je što si to potvrdio testom [-8, -3, -10]. Za punu ocjenu nedostaje ponašanje za praznu listu.",
    "practice_tip": "Kada tražiš najveći ili najmanji element, kreni od prvog elementa liste, a ne od proizvoljne konstante."
  }
}
```

`feedbackSource` is `ai`, `fallback` or `demo`. With `fallback`, `feedback` has the same fields, `detected_misconception` is `null`, and the text comes from the challenge.

## GET /api/progress?userId=

```json
{
  "totalScore": 245,
  "solved": 3,
  "attempted": 4,
  "averageDurationSec": 212,
  "perChallenge": [{ "challengeId": "find-max", "bestScore": 89, "attempts": 2 }],
  "weakCategories": [{ "category": "Off-by-one", "misses": 2 }]
}
```

Definitions are in `docs/DATA_MODEL.md` under derived data.

## POST /api/users

Request `{ "displayName": "dion" }` (2-32 chars). Response `201` `{ "id": "uuid", "displayName": "dion" }`.

## Errors

Shape: `{ "error": { "code": "VALIDATION_ERROR", "message": "Objašnjenje mora imati najmanje 20 karaktera." } }`.

An unavailable AI service is not an error: the evaluation returns `200` with `feedbackSource: "fallback"`.

| HTTP | Code | When |
| --- | --- | --- |
| 400 | VALIDATION_ERROR | Invalid, empty or too long input; wrong hint level |
| 404 | NOT_FOUND | Challenge or attempt does not exist |
| 409 | ALREADY_EVALUATED | Attempt already evaluated |
| 413 | PAYLOAD_TOO_LARGE | Body over 50 KB |
| 429 | RATE_LIMITED | Too many requests |
| 500 | INTERNAL_ERROR | Unexpected server error |
