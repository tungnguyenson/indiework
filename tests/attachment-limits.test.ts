import { describe, test, expect } from 'vitest';
import {
  extFromName,
  humanAttachmentSize,
  MAX_ATTACHMENT_BYTES,
  sanitizeAttachmentName,
} from '@/server/attachment-limits';

describe('attachment limits', () => {
  test('sanitizeAttachmentName strips path segments', () => {
    expect(sanitizeAttachmentName('../../etc/passwd')).toBe('passwd');
    expect(sanitizeAttachmentName('folder\\doc.pdf')).toBe('doc.pdf');
  });

  test('humanAttachmentSize formats bytes', () => {
    expect(humanAttachmentSize(500)).toBe('500 B');
    expect(humanAttachmentSize(2048)).toBe('2.0 KB');
  });

  test('extFromName reads extension', () => {
    expect(extFromName('report.CSV')).toBe('csv');
    expect(extFromName('noext')).toBe('');
  });

  test('MAX_ATTACHMENT_BYTES is 25 MiB', () => {
    expect(MAX_ATTACHMENT_BYTES).toBe(25 * 1024 * 1024);
  });
});
