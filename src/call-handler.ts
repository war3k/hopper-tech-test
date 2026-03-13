import { CallRecord } from "./call-record.i";
import { parseCsv, ValidationError } from "./csv-parser";
import { enrichBatch } from "./enrichment";
import { DatabaseService, SearchIndexService } from "./storage";

type Response = {
  ok: boolean;
  error?: string;
};

export class CallHandler {
  private readonly db: DatabaseService;
  private readonly searchIndex: SearchIndexService;

  constructor(
    db: DatabaseService = new DatabaseService(),
    searchIndex: SearchIndexService = new SearchIndexService(),
  ) {
    this.db = db;
    this.searchIndex = searchIndex;
  }

  /**
   * Handle a batch of call records
   *
 
   * @param payload - The raw batch of CDRs in CSV format (~10 records).
   */
  public async handleBatch(payload: string): Promise<Response> {
    if (!payload?.trim()) {
      return { ok: false, error: "Empty payload" };
    }

    let records: CallRecord[];
    try {
      records = parseCsv(payload);
    } catch (err) {
      if (err instanceof ValidationError) {
        return { ok: false, error: err.message };
      }
      return { ok: false, error: "Failed to parse CSV" };
    }

    if (records.length === 0) {
      return { ok: false, error: "Batch contains no records" };
    }

    // Acknowledge immediately — enrichment runs in the background.
    // In a production system this hand-off would typically go via a message
    // queue (e.g. SQS / RabbitMQ) to guarantee at-least-once processing and
    // allow horizontal scaling of the enrichment workers independently of the
    // ingest API.
    this.processInBackground(records);

    return { ok: true };
  }

  private processInBackground(records: CallRecord[]): void {
    enrichBatch(records)
      .then((enriched) =>
        Promise.all([this.db.save(enriched), this.searchIndex.index(enriched)]),
      )
      .catch((err) => {
        console.error("[CallHandler] Background processing failed:", err);
      });
  }
}
