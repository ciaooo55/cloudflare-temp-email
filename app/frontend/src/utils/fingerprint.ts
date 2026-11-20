import { useGlobalState } from '../store';

const { browserFingerprint } = useGlobalState();
let pendingFingerprint: Promise<string> | undefined;

/**
 * Get browser fingerprint
 * Uses cached value from global state if available to avoid unnecessary computation
 * @returns Fingerprint visitor ID, or 'ERROR' if failed
 */
export const getFingerprint = (): Promise<string> => {
    // Return cached fingerprint if available
    if (browserFingerprint.value) {
        return Promise.resolve(browserFingerprint.value);
    }

    return pendingFingerprint ||= (async () => {
        try {
            const { default: FingerprintJS } = await import('@fingerprintjs/fingerprintjs');
            const fp = await FingerprintJS.load();
            const result = await fp.get();
            browserFingerprint.value = result.visitorId;
            return browserFingerprint.value;
        } catch (error) {
            console.error('Failed to get fingerprint:', error);
            // Return special error value to prevent blocking requests
            const errorValue = 'ERROR';
            browserFingerprint.value = errorValue;
            return errorValue;
        }
    })();
};
