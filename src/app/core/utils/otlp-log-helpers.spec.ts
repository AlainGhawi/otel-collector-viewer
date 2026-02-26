import {
  extractAnyValue,
  kvlistToRecord,
  normalizeSeverity,
  nanoTimestampToDate,
  parseBodyJson,
  generateLogRecordId,
  httpStatusToCategory,
  isRotatedFile,
  formatTimestampLocal,
  formatTimestampUTC,
  formatFileSize,
} from './otlp-log-helpers';

describe('otlp-log-helpers', () => {
  describe('extractAnyValue', () => {
    it('should extract stringValue', () => {
      expect(extractAnyValue({ stringValue: 'hello' })).toBe('hello');
    });

    it('should extract intValue as number', () => {
      expect(extractAnyValue({ intValue: '42' })).toBe(42);
    });

    it('should extract doubleValue', () => {
      expect(extractAnyValue({ doubleValue: 3.14 })).toBe(3.14);
    });

    it('should extract boolValue', () => {
      expect(extractAnyValue({ boolValue: true })).toBe(true);
      expect(extractAnyValue({ boolValue: false })).toBe(false);
    });

    it('should extract arrayValue', () => {
      const result = extractAnyValue({
        arrayValue: {
          values: [{ stringValue: 'a' }, { intValue: '1' }],
        },
      });
      expect(result).toEqual(['a', 1]);
    });

    it('should extract kvlistValue as record', () => {
      const result = extractAnyValue({
        kvlistValue: {
          values: [
            { key: 'name', value: { stringValue: 'test' } },
            { key: 'count', value: { intValue: '5' } },
          ],
        },
      });
      expect(result).toEqual({ name: 'test', count: 5 });
    });

    it('should extract bytesValue as string', () => {
      expect(extractAnyValue({ bytesValue: 'dGVzdA==' })).toBe('dGVzdA==');
    });

    it('should return undefined for empty/undefined input', () => {
      expect(extractAnyValue(undefined)).toBeUndefined();
      expect(extractAnyValue({})).toBeUndefined();
    });
  });

  describe('kvlistToRecord', () => {
    it('should convert key-value pairs to a record', () => {
      const result = kvlistToRecord([
        { key: 'app', value: { stringValue: 'server' } },
        { key: 'count', value: { intValue: '10' } },
        { key: 'active', value: { boolValue: true } },
      ]);
      expect(result).toEqual({ app: 'server', count: 10, active: true });
    });

    it('should skip non-primitive values', () => {
      const result = kvlistToRecord([
        { key: 'simple', value: { stringValue: 'ok' } },
        {
          key: 'nested',
          value: { kvlistValue: { values: [{ key: 'x', value: { stringValue: 'y' } }] } },
        },
      ]);
      expect(result).toEqual({ simple: 'ok' });
    });

    it('should return empty record for undefined/empty input', () => {
      expect(kvlistToRecord(undefined)).toEqual({});
      expect(kvlistToRecord([])).toEqual({});
    });
  });

  describe('normalizeSeverity', () => {
    it('should map severity numbers 1-4 to TRACE', () => {
      for (let i = 1; i <= 4; i++) {
        expect(normalizeSeverity(i)).toBe('TRACE');
      }
    });

    it('should map severity numbers 5-8 to DEBUG', () => {
      for (let i = 5; i <= 8; i++) {
        expect(normalizeSeverity(i)).toBe('DEBUG');
      }
    });

    it('should map severity numbers 9-12 to INFO', () => {
      for (let i = 9; i <= 12; i++) {
        expect(normalizeSeverity(i)).toBe('INFO');
      }
    });

    it('should map severity numbers 13-16 to WARN', () => {
      for (let i = 13; i <= 16; i++) {
        expect(normalizeSeverity(i)).toBe('WARN');
      }
    });

    it('should map severity numbers 17-20 to ERROR', () => {
      for (let i = 17; i <= 20; i++) {
        expect(normalizeSeverity(i)).toBe('ERROR');
      }
    });

    it('should map severity numbers 21-24 to FATAL', () => {
      for (let i = 21; i <= 24; i++) {
        expect(normalizeSeverity(i)).toBe('FATAL');
      }
    });

    it('should fall back to severityText when number is missing', () => {
      expect(normalizeSeverity(undefined, 'Info')).toBe('INFO');
      expect(normalizeSeverity(undefined, 'Warning')).toBe('WARN');
      expect(normalizeSeverity(undefined, 'Error')).toBe('ERROR');
      expect(normalizeSeverity(undefined, 'Err')).toBe('ERROR');
      expect(normalizeSeverity(undefined, 'Fatal')).toBe('FATAL');
      expect(normalizeSeverity(undefined, 'Critical')).toBe('FATAL');
      expect(normalizeSeverity(undefined, 'Debug')).toBe('DEBUG');
      expect(normalizeSeverity(undefined, 'Trace')).toBe('TRACE');
    });

    it('should default to INFO when both are missing', () => {
      expect(normalizeSeverity(undefined, undefined)).toBe('INFO');
      expect(normalizeSeverity(0, '')).toBe('INFO');
    });

    it('should prefer severityNumber over severityText', () => {
      expect(normalizeSeverity(17, 'Info')).toBe('ERROR');
    });
  });

  describe('nanoTimestampToDate', () => {
    it('should convert nanosecond string to Date', () => {
      // 1772127180282347439 ns = ~2026-02-26T17:33:00Z
      const date = nanoTimestampToDate('1772127180282347439');
      expect(date.getFullYear()).toBe(2026);
      expect(date instanceof Date).toBe(true);
      expect(date.getTime()).toBeGreaterThan(0);
    });

    it('should handle millisecond string (13 digits)', () => {
      const date = nanoTimestampToDate('1703001234567');
      expect(date instanceof Date).toBe(true);
      expect(date.getTime()).toBe(1703001234567);
    });

    it('should handle second string (10 digits)', () => {
      const date = nanoTimestampToDate('1703001234');
      expect(date.getTime()).toBe(1703001234000);
    });

    it('should return epoch 0 for undefined/empty', () => {
      expect(nanoTimestampToDate(undefined).getTime()).toBe(0);
      expect(nanoTimestampToDate('').getTime()).toBe(0);
    });

    it('should handle ISO 8601 string', () => {
      const date = nanoTimestampToDate('2026-02-26T17:30:36Z');
      expect(date.getFullYear()).toBe(2026);
    });

    it('should return epoch 0 for unparseable string', () => {
      expect(nanoTimestampToDate('not-a-date').getTime()).toBe(0);
    });
  });

  describe('parseBodyJson', () => {
    it('should parse valid JSON body', () => {
      const result = parseBodyJson(
        '{"message":"hello","level":"INFO","http":{"method":"GET","path":"/api","status":200}}'
      );
      expect(result).toBeTruthy();
      expect(result!.message).toBe('hello');
      expect(result!.level).toBe('INFO');
      expect(result!.http?.method).toBe('GET');
      expect(result!.http?.status).toBe(200);
    });

    it('should return null for plain text body', () => {
      expect(parseBodyJson('Just a plain text log message')).toBeNull();
    });

    it('should return null for empty string', () => {
      expect(parseBodyJson('')).toBeNull();
    });

    it('should return null for non-object JSON', () => {
      expect(parseBodyJson('"just a string"')).toBeNull();
      expect(parseBodyJson('42')).toBeNull();
    });

    it('should return null for invalid JSON starting with {', () => {
      expect(parseBodyJson('{truncated')).toBeNull();
    });

    it('should handle JSON with padding field', () => {
      const result = parseBodyJson(
        '{"padding":"AAAA...","message":"test","level":"ERROR"}'
      );
      expect(result).toBeTruthy();
      expect(result!.message).toBe('test');
      // padding is present in parsed result but should be ignored by display logic
      expect((result as Record<string, unknown>)['padding']).toBe('AAAA...');
    });

    it('should handle JSON with all structured fields', () => {
      const result = parseBodyJson(
        '{"timestamp":"2026-01-01T00:00:00Z","level":"WARN","message":"test",' +
        '"http":{"method":"POST","path":"/api","status":201},' +
        '"user":{"id":"u1","session_id":"s1","ip":"1.2.3.4"},' +
        '"trace":{"trace_id":"t1","span_id":"sp1"},' +
        '"service":{"version":"1.0"},' +
        '"tags":["a","b"],' +
        '"attrs":{"key":"val"}}'
      );
      expect(result).toBeTruthy();
      expect(result!.user?.id).toBe('u1');
      expect(result!.trace?.trace_id).toBe('t1');
      expect(result!.service?.version).toBe('1.0');
      expect(result!.tags).toEqual(['a', 'b']);
      expect(result!.attrs).toEqual({ key: 'val' });
    });
  });

  describe('generateLogRecordId', () => {
    it('should generate deterministic IDs', () => {
      const id1 = generateLogRecordId('123', 9, 'body', 'file.json', 1);
      const id2 = generateLogRecordId('123', 9, 'body', 'file.json', 1);
      expect(id1).toBe(id2);
    });

    it('should generate different IDs for different inputs', () => {
      const id1 = generateLogRecordId('123', 9, 'body1', 'file.json', 1);
      const id2 = generateLogRecordId('123', 9, 'body2', 'file.json', 1);
      expect(id1).not.toBe(id2);
    });

    it('should generate different IDs for different line numbers', () => {
      const id1 = generateLogRecordId('123', 9, 'body', 'file.json', 1);
      const id2 = generateLogRecordId('123', 9, 'body', 'file.json', 2);
      expect(id1).not.toBe(id2);
    });
  });

  describe('httpStatusToCategory', () => {
    it('should map 2xx status codes', () => {
      expect(httpStatusToCategory(200)).toBe('2xx');
      expect(httpStatusToCategory(201)).toBe('2xx');
      expect(httpStatusToCategory(299)).toBe('2xx');
    });

    it('should map 3xx status codes', () => {
      expect(httpStatusToCategory(301)).toBe('3xx');
      expect(httpStatusToCategory(304)).toBe('3xx');
    });

    it('should map 4xx status codes', () => {
      expect(httpStatusToCategory(400)).toBe('4xx');
      expect(httpStatusToCategory(404)).toBe('4xx');
      expect(httpStatusToCategory(499)).toBe('4xx');
    });

    it('should map 5xx status codes', () => {
      expect(httpStatusToCategory(500)).toBe('5xx');
      expect(httpStatusToCategory(503)).toBe('5xx');
    });

    it('should return undefined for undefined input', () => {
      expect(httpStatusToCategory(undefined)).toBeUndefined();
    });

    it('should return undefined for status < 200', () => {
      expect(httpStatusToCategory(100)).toBeUndefined();
    });
  });

  describe('isRotatedFile', () => {
    it('should detect rotated files', () => {
      expect(isRotatedFile('A_logs-2026-02-26T17-30-14.173.json')).toBe(true);
    });

    it('should not detect current files', () => {
      expect(isRotatedFile('A_logs.json')).toBe(false);
    });
  });

  describe('formatTimestampLocal', () => {
    it('should format a date as YYYY-MM-DD HH:mm:ss.SSS', () => {
      const date = new Date(2026, 0, 15, 13, 5, 7, 42); // local time
      const result = formatTimestampLocal(date);
      expect(result).toBe('2026-01-15 13:05:07.042');
    });
  });

  describe('formatTimestampUTC', () => {
    it('should format a date in UTC', () => {
      const date = new Date(Date.UTC(2026, 0, 15, 13, 5, 7, 42));
      const result = formatTimestampUTC(date);
      expect(result).toBe('2026-01-15 13:05:07.042');
    });
  });

  describe('formatFileSize', () => {
    it('should format bytes', () => {
      expect(formatFileSize(500)).toBe('500 B');
    });

    it('should format kilobytes', () => {
      expect(formatFileSize(1536)).toBe('1.5 KB');
    });

    it('should format megabytes', () => {
      expect(formatFileSize(10 * 1024 * 1024)).toBe('10.0 MB');
    });
  });
});
