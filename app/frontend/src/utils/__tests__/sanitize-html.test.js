// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { sanitizeHtml, htmlToPlainText } from '../sanitize-html';

describe('sanitizeHtml', () => {
    it('preserves safe announcement markup', () => {
        expect(sanitizeHtml('<strong>Notice</strong>')).toBe('<strong>Notice</strong>');
    });

    it('removes executable markup and unsafe attributes', () => {
        const sanitized = sanitizeHtml(
            '<script>alert(1)</script><img src="x" onerror="alert(1)">'
        );

        expect(sanitized).not.toContain('<script');
        expect(sanitized).not.toContain('onerror');
        expect(sanitized).toContain('<img src="x">');
    });

    it('returns an empty string for non-string values', () => {
        expect(sanitizeHtml(null)).toBe('');
        expect(sanitizeHtml({ value: '<strong>unsafe ref</strong>' })).toBe('');
    });
});

describe('htmlToPlainText', () => {
    it('keeps readable lines and decodes entities without resource elements', () => {
        expect(htmlToPlainText('<style>body{color:red}</style><p>Code &amp; login</p><div>123456<br>Done</div>'))
            .toBe('Code & login\n123456\nDone');
    });
    it('handles empty input', () => {
        expect(htmlToPlainText(null)).toBe('');
    });
});
