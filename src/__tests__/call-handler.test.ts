import { CallHandler } from '../call-handler';
import { DatabaseService, SearchIndexService } from '../storage';
import * as operatorLookup from '../operator-lookup';

const VALID_CSV = [
  'id,callStartTime,callEndTime,fromNumber,toNumber,callType,region',
  'call-001,2026-01-15T10:00:00Z,2026-01-15T10:05:00Z,+14155551234,+442071234567,voice,us-east',
  'call-002,2026-01-15T11:00:00Z,2026-01-15T11:02:30Z,+49301234567,+33123456789,video,eu-west',
].join('\n');

const MOCK_OPERATOR_INFO: operatorLookup.OperatorInfo = {
  operator: 'AT&T',
  country: 'United States',
  estimatedCostPerMinute: 0.02,
};

/** Waits for all pending microtasks and a short macrotask tick. */
const flushAsync = () => new Promise<void>(resolve => setTimeout(resolve, 50));

describe('CallHandler', () => {
  let handler: CallHandler;
  let mockDb: jest.Mocked<DatabaseService>;
  let mockSearch: jest.Mocked<SearchIndexService>;

  beforeEach(() => {
    mockDb = { save: jest.fn().mockResolvedValue(undefined) } as jest.Mocked<DatabaseService>;
    mockSearch = { index: jest.fn().mockResolvedValue(undefined) } as jest.Mocked<SearchIndexService>;
    handler = new CallHandler(mockDb, mockSearch);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('acknowledgment', () => {
    it('returns ok:true for a valid batch', async () => {
      jest.spyOn(operatorLookup, 'lookupOperator').mockResolvedValue(MOCK_OPERATOR_INFO);
      const response = await handler.handleBatch(VALID_CSV);
      expect(response).toEqual({ ok: true });
    });

    it('returns before background enrichment completes', async () => {
      // lookupOperator never resolves during this test — response must still arrive
      jest.spyOn(operatorLookup, 'lookupOperator').mockReturnValue(new Promise(() => {}));
      const response = await handler.handleBatch(VALID_CSV);
      expect(response).toEqual({ ok: true });
    });
  });

  describe('input validation', () => {
    it('rejects an empty string payload', async () => {
      const response = await handler.handleBatch('');
      expect(response).toEqual({ ok: false, error: 'Empty payload' });
    });

    it('rejects a whitespace-only payload', async () => {
      const response = await handler.handleBatch('   \n  ');
      expect(response).toEqual({ ok: false, error: 'Empty payload' });
    });

    it('rejects CSV with an invalid phone number', async () => {
      const csv = [
        'id,callStartTime,callEndTime,fromNumber,toNumber,callType,region',
        'call-001,2026-01-15T10:00:00Z,2026-01-15T10:05:00Z,not-a-number,+442071234567,voice,us-east',
      ].join('\n');
      const response = await handler.handleBatch(csv);
      expect(response.ok).toBe(false);
      expect(response.error).toContain('E.164');
    });

    it('rejects CSV with an invalid callType', async () => {
      const csv = [
        'id,callStartTime,callEndTime,fromNumber,toNumber,callType,region',
        'call-001,2026-01-15T10:00:00Z,2026-01-15T10:05:00Z,+14155551234,+442071234567,fax,us-east',
      ].join('\n');
      const response = await handler.handleBatch(csv);
      expect(response.ok).toBe(false);
      expect(response.error).toContain("'voice' or 'video'");
    });

    it('rejects CSV where callEndTime is before callStartTime', async () => {
      const csv = [
        'id,callStartTime,callEndTime,fromNumber,toNumber,callType,region',
        'call-001,2026-01-15T10:05:00Z,2026-01-15T10:00:00Z,+14155551234,+442071234567,voice,us-east',
      ].join('\n');
      const response = await handler.handleBatch(csv);
      expect(response.ok).toBe(false);
      expect(response.error).toContain('callEndTime must be after callStartTime');
    });
  });

  describe('background enrichment and storage', () => {
    it('enriches records and persists them after acknowledging', async () => {
      jest.spyOn(operatorLookup, 'lookupOperator').mockResolvedValue(MOCK_OPERATOR_INFO);

      await handler.handleBatch(VALID_CSV);
      await flushAsync();

      expect(mockDb.save).toHaveBeenCalledTimes(1);
      expect(mockSearch.index).toHaveBeenCalledTimes(1);
    });

    it('calculates duration and maps operator fields correctly', async () => {
      jest.spyOn(operatorLookup, 'lookupOperator').mockResolvedValue(MOCK_OPERATOR_INFO);

      await handler.handleBatch(VALID_CSV);
      await flushAsync();

      const saved = mockDb.save.mock.calls[0][0];
      expect(saved).toHaveLength(2);
      expect(saved[0]).toMatchObject({
        id: 'call-001',
        duration: 300, // 5 minutes in seconds
        fromOperator: 'AT&T',
        fromCountry: 'United States',
        toOperator: 'AT&T',
        toCountry: 'United States',
        estimatedCost: 0.1, // 300s / 60 * $0.02
      });
    });

    it('stores records with undefined operator fields when all lookups fail', async () => {
      jest.spyOn(operatorLookup, 'lookupOperator').mockRejectedValue(
        new Error('Operator lookup service temporarily unavailable'),
      );

      await handler.handleBatch(VALID_CSV);
      await flushAsync();

      expect(mockDb.save).toHaveBeenCalledTimes(1);
      const saved = mockDb.save.mock.calls[0][0];
      expect(saved[0].fromOperator).toBeUndefined();
      expect(saved[0].toOperator).toBeUndefined();
      expect(saved[0].estimatedCost).toBeUndefined();
      // Duration is always available (computed locally, no API needed)
      expect(saved[0].duration).toBe(300);
    });

    it('stores records with partial operator data when one lookup fails', async () => {
      jest
        .spyOn(operatorLookup, 'lookupOperator')
        .mockResolvedValueOnce(MOCK_OPERATOR_INFO) // fromNumber succeeds
        .mockRejectedValueOnce(new Error('timeout')); // toNumber fails

      await handler.handleBatch(VALID_CSV.split('\n').slice(0, 2).join('\n'));
      await flushAsync();

      const saved = mockDb.save.mock.calls[0][0];
      expect(saved[0].fromOperator).toBe('AT&T');
      expect(saved[0].toOperator).toBeUndefined();
      expect(saved[0].estimatedCost).toBeDefined(); // uses fromInfo
    });
  });
});
