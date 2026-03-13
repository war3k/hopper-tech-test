import { parse } from "csv-parse/sync";
import { CallRecord } from "./call-record.i";

const E164_REGEX = /^\+[1-9]\d{1,14}$/;
const VALID_CALL_TYPES = new Set<string>(["voice", "video"]);

export class ValidationError extends Error {
  constructor(public readonly errors: string[]) {
    super(`Validation failed: ${errors.join("; ")}`);
    this.name = "ValidationError";
  }
}

export function parseCsv(payload: string): CallRecord[] {
  let rows: Record<string, string>[];

  try {
    rows = parse(payload, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });
  } catch {
    throw new ValidationError(["CSV is malformed and could not be parsed"]);
  }

  const errors: string[] = [];
  const callRecords: CallRecord[] = [];

  for (let i = 0; i < rows.length; i++) {
    const rowErrors = validateRow(rows[i], i);
    if (rowErrors.length > 0) {
      errors.push(...rowErrors);
    } else {
      callRecords.push(rows[i] as unknown as CallRecord);
    }
  }

  if (errors.length > 0) {
    throw new ValidationError(errors);
  }

  return callRecords;
}

function validateRow(row: Record<string, string>, index: number): string[] {
  const errors: string[] = [];
  const prefix = `Row ${index + 1}`;

  if (!row.id?.trim()) {
    errors.push(`${prefix}: missing id`);
  }

  const startTime = new Date(row.callStartTime);
  const endTime = new Date(row.callEndTime);

  if (!row.callStartTime || isNaN(startTime.getTime())) {
    errors.push(`${prefix}: invalid callStartTime`);
  }

  if (!row.callEndTime || isNaN(endTime.getTime())) {
    errors.push(`${prefix}: invalid callEndTime`);
  }

  if (
    !isNaN(startTime.getTime()) &&
    !isNaN(endTime.getTime()) &&
    endTime <= startTime
  ) {
    errors.push(`${prefix}: callEndTime must be after callStartTime`);
  }

  if (!E164_REGEX.test(row.fromNumber)) {
    errors.push(
      `${prefix}: fromNumber must be in E.164 format (e.g. +14155551234)`,
    );
  }

  if (!E164_REGEX.test(row.toNumber)) {
    errors.push(
      `${prefix}: toNumber must be in E.164 format (e.g. +14155551234)`,
    );
  }

  if (!VALID_CALL_TYPES.has(row.callType)) {
    errors.push(
      `${prefix}: callType must be 'voice' or 'video', got '${row.callType}'`,
    );
  }

  if (!row.region?.trim()) {
    errors.push(`${prefix}: missing region`);
  }

  return errors;
}
