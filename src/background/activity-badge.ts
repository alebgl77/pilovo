import type { WebActivityObservation, WebAttentionReason } from '../shared/activity';

// The toolbar badge and title carry counts and fixed reason words only: never a provider, tab, title, URL or page content.
export type ActivityLanguage = 'fr' | 'en';
export interface ActivityBadge { text: string; background: string; textColor: string; title: string }
/** The app's own language setting (Settings.language, default French), not the browser UI language. */
export const activityLanguage = (value: unknown): ActivityLanguage => value === 'en' ? 'en' : 'fr';

/** Most urgent first: the badge color and the title's reason follow the most urgent unacknowledged attention. */
export const BADGE_PRIORITY = ['error_visible', 'input_required', 'response_ready'] as const satisfies readonly WebAttentionReason[];
// White text reaches at least 4.5:1 on every background (computed in tests/core/activity-badge.test.ts).
// Olive is the brand media color; red, amber-brown and gray follow the danger, warning and muted tokens.
export const BADGE_COLORS = { error_visible: '#B42318', input_required: '#8A4B08', response_ready: '#4B5D3A', working: '#5E5E5C' } as const;
export const BADGE_TEXT_COLOR = '#FFFFFF';
/** Work in progress shows a mark, never a count. */
export const BADGE_WORKING = '\u2026';

// chrome.i18n follows the browser UI language and cannot switch at runtime, so the title uses this fixed FR/EN table.
// Reasons give [singular, plural]; "à vérifier", "en cours", "to review" and "working" do not vary.
export const BADGE_TITLES = {
  fr: { review: 'à vérifier', working: 'en cours', including: 'dont', reasons: { error_visible: ['erreur visible', 'erreurs visibles'], input_required: ['intervention demandée', 'interventions demandées'], response_ready: ['réponse disponible', 'réponses disponibles'] } },
  en: { review: 'to review', working: 'working', including: 'including', reasons: { error_visible: ['visible error', 'visible errors'], input_required: ['input request', 'input requests'], response_ready: ['response available', 'responses available'] } },
} as const satisfies Record<ActivityLanguage, { review: string; working: string; including: string; reasons: Record<WebAttentionReason, readonly [string, string]> }>;

export interface BadgeCounts { review: number; urgent?: { reason: WebAttentionReason; count: number }; working: number }
/** "Pilovo — 3 à vérifier, dont 1 erreur visible · 1 en cours"; when every item shares the urgent reason,
 * "Pilovo — 2 to review (responses available)". Zero parts are omitted; nothing counted gives "Pilovo". */
export function badgeTitle({ review, urgent, working }: BadgeCounts, language: ActivityLanguage): string {
  const words = BADGE_TITLES[language], parts: string[] = [];
  const reason = (count: number) => words.reasons[urgent!.reason][count === 1 ? 0 : 1];
  if (review > 0) parts.push(!urgent ? `${review} ${words.review}` : urgent.count >= review ? `${review} ${words.review} (${reason(review)})` : `${review} ${words.review}, ${words.including} ${urgent.count} ${reason(urgent.count)}`);
  if (working > 0) parts.push(`${working} ${words.working}`);
  return parts.length ? `Pilovo — ${parts.join(' · ')}` : 'Pilovo';
}

/** Computed from live (unexpired) observations only. Unacknowledged attention shows its count on the color of the most
 * urgent reason; otherwise working shows "…"; acknowledged attention, idle and unknown rows never light the badge. */
export function activityBadge(observations: readonly WebActivityObservation[], now: number, language: ActivityLanguage): ActivityBadge {
  const live = observations.filter(observation => observation.validUntil > now);
  const pending = live.flatMap(observation => observation.state === 'attention' && observation.attention && !observation.attention.acknowledged ? [observation.attention.reason] : []);
  const working = live.filter(observation => observation.state === 'working').length;
  const reason = BADGE_PRIORITY.find(item => pending.includes(item));
  const urgent = reason && { reason, count: pending.filter(item => item === reason).length };
  const title = badgeTitle({ review: pending.length, urgent, working }, language);
  if (urgent) return { text: String(pending.length), background: BADGE_COLORS[urgent.reason], textColor: BADGE_TEXT_COLOR, title };
  return { text: working ? BADGE_WORKING : '', background: BADGE_COLORS.working, textColor: BADGE_TEXT_COLOR, title };
}
export const sameBadge = (a: ActivityBadge, b: ActivityBadge) => a.text === b.text && a.background === b.background && a.textColor === b.textColor && a.title === b.title;
