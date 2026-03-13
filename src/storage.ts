import { EnrichedCallRecord } from './call-record.i';

/**
 * Stub for relational database persistence.
 *
 * Production choice: PostgreSQL via a connection pool (pg / Prisma).
 * Schema: a `call_records` table with indexed columns on `call_start_time`,
 * `from_number`, and `to_number` for time-range and number-based queries.
 * Upsert on `id` ensures idempotent reprocessing of the same batch.
 *
 * Example query:
 *   INSERT INTO call_records (id, call_start_time, ..., from_operator, estimated_cost)
 *   VALUES ($1, $2, ..., $N)
 *   ON CONFLICT (id) DO UPDATE SET ...;
 */
export class DatabaseService {
  async save(records: EnrichedCallRecord[]): Promise<void> {
    // Production: await pool.query(buildUpsertSql(records));
    console.log(`[DB] Saved ${records.length} enriched records`);
  }
}

/**
 * Stub for full-text / analytics search indexing.
 *
 * Production choice: Elasticsearch (or OpenSearch).
 * Records are indexed into a `calls` index with keyword fields for
 * operator, country, and region — enabling faceted search, aggregations
 * (cost by region, volume by operator), and sub-second dashboard queries.
 *
 * Example bulk index:
 *   client.bulk({
 *     body: records.flatMap(r => [
 *       { index: { _index: 'calls', _id: r.id } },
 *       r,
 *     ]),
 *   });
 */
export class SearchIndexService {
  async index(records: EnrichedCallRecord[]): Promise<void> {
    // Production: await esClient.bulk({ body: buildBulkBody(records) });
    console.log(`[Search] Indexed ${records.length} enriched records`);
  }
}
