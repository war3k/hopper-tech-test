# Call Record Processing

## How it works

### Sub-500ms acknowledgment

The constraint: confirm receipt in under 500ms, while operator lookups take 100–300ms each.

Solution: decouple ingestion from enrichment.

1. `handleBatch` parses and validates the CSV synchronously (fast, in-memory).
2. Returns `{ ok: true }` immediately — before any API calls are made.
3. `processInBackground` runs enrichment and storage as a detached Promise.

In production, step 3 would hand off to a message queue (Inngest, Kafka) for durability and retry logic.

### Parallel enrichment

For each record, `fromNumber` and `toNumber` lookups run concurrently via `Promise.allSettled`. The whole batch is also processed in parallel. For 10 records that's 20 concurrent requests — wall-clock time drops from ~6s (sequential) to ~300ms.

`Promise.allSettled` over `Promise.all`: a failed lookup (5% failure rate per spec) shouldn't lose the whole record. Partial enrichment is better than nothing.

### Validation

The entire batch is validated before any records are accepted. Checks:

- required fields are present and non-empty
- `callStartTime` / `callEndTime` are valid timestamps, end is after start
- `fromNumber` / `toNumber` match E.164 format
- `callType` is `'voice'` or `'video'`

Empty or whitespace-only payloads are rejected immediately.

### Storage

Two stubs showing the intended persistence layer:

- **`DatabaseService`** → PostgreSQL. Upsert on `id` makes reprocessing idempotent.
- **`SearchIndexService`** → Elasticsearch/OpenSearch. Bulk-indexed for search and aggregations.

## File structure

```
src/
  call-record.i.ts       # CallRecord and EnrichedCallRecord interfaces
  operator-lookup.ts     # mock operator API
  csv-parser.ts          # CSV parsing and validation
  enrichment.ts          # parallel enrichment logic
  storage.ts             # DB and search index stubs
  call-handler.ts        # main entry point — handleBatch()
  __tests__/
    call-handler.test.ts
```

## Running tests

```bash
npm install
npm test
```

## AI usage

Built with Claude's help. The architecture (fire-and-forget, validation structure) was designed together. All code reviewed and understood before submission.
