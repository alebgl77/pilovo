import type { WebAttentionReason } from '../shared/activity';
import { WEB_PROVIDERS, type WebProvider } from '../shared/web';
import type { ActivityLanguage } from './activity-badge';

// Optional OS notifications, opted into per service and allowed by the optional `notifications` permission. A notification
// carries the service name, a fixed reason and the worker's session number only: never a session name, tab title, URL or
// page content.
export const NOTIFICATION_PERMISSION = 'notifications';
export interface ActivityNotice { title: string; message: string }
// chrome.i18n follows the browser UI language and cannot switch at runtime: like the badge title, the text follows the
// app's language setting through this fixed FR/EN table.
export const NOTICE_REASONS = {
  fr: { response_ready: 'Réponse disponible', input_required: 'Intervention demandée', error_visible: 'Erreur visible' },
  en: { response_ready: 'Response available', input_required: 'Input requested', error_visible: 'Error visible' },
} as const satisfies Record<ActivityLanguage, Record<WebAttentionReason, string>>;
/** Title: the service name ("Claude", "ChatGPT"); message: "Réponse disponible · session 2". */
export function activityNotice(provider: WebProvider, reason: WebAttentionReason, sessionNumber: number, language: ActivityLanguage): ActivityNotice {
  return { title: WEB_PROVIDERS.find(item => item.id === provider)!.name, message: `${NOTICE_REASONS[language][reason]} · session ${sessionNumber}` };
}
// Opaque IDs: a fixed prefix, then the worker-generated observation and attention UUIDs. Nothing else is encoded.
const NOTICE_PREFIX = 'pilovo:';
const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const noticePattern = new RegExp(`^${NOTICE_PREFIX}(${uuid}):(${uuid})$`);
export const noticeId = (observationId: string, attentionId: string) => `${NOTICE_PREFIX}${observationId}:${attentionId}`;
/** The observation and attention identities of a notification ID this worker could have made, or undefined. */
export function parseNoticeId(id: unknown): { observationId: string; attentionId: string } | undefined {
  const match = typeof id === 'string' && id.length <= 128 ? noticePattern.exec(id) : null;
  return match ? { observationId: match[1], attentionId: match[2] } : undefined;
}
export const isNoticeId = (id: unknown): id is string => typeof id === 'string' && id.startsWith(NOTICE_PREFIX);
// At most one live notification per tab and NOTICE_LIMIT in all (the oldest goes first); the identities already notified
// are remembered up to NOTIFIED_LIMIT, oldest forgotten first.
export const NOTICE_LIMIT = 16, NOTIFIED_LIMIT = 256;
// A notification whose evidence only lapsed (expired, failed or unrecognized samples: a throttled background tab between the
// 30 s activity alarms) waits NOTICE_GRACE for the same reason to be raised again in its tab. A click in that state requests a
// fresh sample and waits up to NOTICE_RESAMPLE for it (one rate-bounded sample and its 2 s timeout).
export const NOTICE_GRACE = 35_000, NOTICE_RESAMPLE = 3_500;
export function remember(seen: Set<string>, value: string, limit: number) {
  seen.delete(value); seen.add(value);
  while (seen.size > limit) seen.delete(seen.values().next().value!);
}
