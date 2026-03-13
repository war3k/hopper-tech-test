import { CallRecord, EnrichedCallRecord } from "./call-record.i";
import { lookupOperator } from "./operator-lookup";

function toCallDate(isoTimestamp: string): string {
  return new Date(isoTimestamp).toISOString().slice(2, 10);
}

function calculateDuration(start: string, end: string): number {
  return Math.round(
    (new Date(end).getTime() - new Date(start).getTime()) / 1000,
  );
}

export async function enrichRecord(
  record: CallRecord,
): Promise<EnrichedCallRecord> {
  const callDate = toCallDate(record.callStartTime);

  const [fromResult, toResult] = await Promise.allSettled([
    lookupOperator(record.fromNumber, callDate),
    lookupOperator(record.toNumber, callDate),
  ]);

  const fromInfo =
    fromResult.status === "fulfilled" ? fromResult.value : undefined;
  const toInfo = toResult.status === "fulfilled" ? toResult.value : undefined;

  const duration = calculateDuration(record.callStartTime, record.callEndTime);

  const estimatedCost =
    fromInfo !== undefined
      ? parseFloat(
          ((duration / 60) * fromInfo.estimatedCostPerMinute).toFixed(4),
        )
      : undefined;

  return {
    ...record,
    duration,
    fromOperator: fromInfo?.operator,
    toOperator: toInfo?.operator,
    fromCountry: fromInfo?.country,
    toCountry: toInfo?.country,
    estimatedCost,
  };
}

export async function enrichBatch(
  records: CallRecord[],
): Promise<EnrichedCallRecord[]> {
  return Promise.all(records.map(enrichRecord));
}
