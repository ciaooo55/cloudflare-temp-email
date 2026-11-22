import { createHash, timingSafeEqual } from 'node:crypto';

export function secretEquals(provided: unknown, expected: string): boolean {
    if (typeof provided !== 'string') return false;
    const digest = (value: string) => createHash('sha256').update(value).digest();
    return timingSafeEqual(digest(provided), digest(expected));
}

export function matchesSecret(provided: unknown, expected: string[]): boolean {
    let matches = 0;
    for (const secret of expected) matches |= Number(secretEquals(provided, secret));
    return matches !== 0;
}

export function isValidJwtSecret(secret: unknown): secret is string {
    return typeof secret === 'string' && secret.trim() !== '' && secret.trim() !== 'xxx';
}
