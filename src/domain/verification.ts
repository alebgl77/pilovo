import { z } from 'zod';
import { HubError } from '../shared/errors';
import type { VerificationCheck } from '../shared/types';
export const MAX_VERIFICATION_BYTES = 10 * 1024 * 1024;
export const hashEvidenceSchema = z.object({ fileName: z.string().min(1).max(255).regex(/^[^\u0000-\u001f\u007f]+$/), byteSize: z.number().int().min(0).max(MAX_VERIFICATION_BYTES), expectedSha256: z.string().regex(/^[a-f0-9]{64}$/), actualSha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
export type HashEvidence = z.infer<typeof hashEvidenceSchema>;
export async function hashFile(file: File, expectedSha256: string): Promise<HashEvidence> {
  if (!file || !Number.isSafeInteger(file.size) || file.size > MAX_VERIFICATION_BYTES || file.size < 0) throw new HubError('validation.invalid');
  const reference = expectedSha256.trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(reference)) throw new HubError('validation.invalid');
  const bytes = await file.arrayBuffer();
  if (bytes.byteLength !== file.size || bytes.byteLength > MAX_VERIFICATION_BYTES) throw new HubError('validation.invalid');
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const evidence = { fileName: file.name, byteSize: file.size, expectedSha256: reference, actualSha256: Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('') };
  if (!hashEvidenceSchema.safeParse(evidence).success) throw new HubError('validation.invalid');
  return evidence;
}
export function makeVerificationCheck(evidence: HashEvidence, checkedAt: string): VerificationCheck {
  const result = hashEvidenceSchema.safeParse(evidence);
  if (!result.success) throw new HubError('validation.invalid');
  return { ...result.data, id: crypto.randomUUID(), criterion: 'sha256_matches_reference', method: 'sha256', checkedAt, passed: evidence.actualSha256 === evidence.expectedSha256, provenance: 'hub_observed', referenceProvenance: 'user_supplied' };
}
