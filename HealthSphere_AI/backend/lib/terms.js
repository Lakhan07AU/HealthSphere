/* ---------- Terms of Service, Consent & Legal Disclosures ----------
   Version-stamped so every acceptance is recorded against an immutable
   snapshot of the terms the user actually saw. Bump TERMS_VERSION whenever
   the text below changes; old acceptances remain valid for their version. */

export const TERMS_VERSION = '1.0';
export const TERMS_EFFECTIVE_DATE = '2026-01-01';
export const TERMS_TITLE = 'Terms of Service, Privacy & Health Data Consent';

/* Consent keys the backend requires at registration. Keep in sync with the
   frontend consent block in views-auth.js. */
export const REQUIRED_CONSENTS = [
  'termsOfService',
  'healthDataConsent',
  'acknowledgements'
];

/* Human-readable labels used for audit logs and admin review. */
export const CONSENT_LABELS = {
  termsOfService: 'Accepted Terms of Service v' + TERMS_VERSION,
  healthDataConsent: 'Consented to processing of personal & health data',
  acknowledgements: 'Acknowledged medical, privacy & liability disclaimers'
};

/**
 * Validate a consent payload from the registration request.
 * Returns { ok: true, record } or throws an Error with a user-facing message.
 * The record is a compact, immutable audit object stored on the user.
 */
export function validateConsent(body = {}) {
  const missing = REQUIRED_CONSENTS.filter(k => !body[k]);
  if (missing.length) {
    throw new Error(
      'You must accept the Terms of Service and provide the required consents to create an account.'
    );
  }
  // Record a timestamped, version-stamped proof of acceptance.
  const record = {
    termsVersion: TERMS_VERSION,
    termsEffectiveDate: TERMS_EFFECTIVE_DATE,
    acceptedAt: new Date().toISOString(),
    consents: Object.fromEntries(REQUIRED_CONSENTS.map(k => [k, true])),
    // Free-text consent text hash is intentionally omitted; the version stamp
    // plus timestamp is the legal proof and keeps the record small/portable.
    userAgent: String(body.userAgent || '').slice(0, 200),
    acceptedIp: String(body.ip || '').slice(0, 64)
  };
  return { ok: true, record };
}

/** Shape returned by GET /api/terms (public — no auth required). */
export function publicTerms() {
  return {
    version: TERMS_VERSION,
    effectiveDate: TERMS_EFFECTIVE_DATE,
    title: TERMS_TITLE,
    requiredConsents: REQUIRED_CONSENTS.map(key => ({
      key,
      label: CONSENT_LABELS[key] || key
    }))
  };
}
