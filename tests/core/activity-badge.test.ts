import { describe, expect, it } from 'vitest';
import { activityBadge, activityLanguage, badgeTitle, BADGE_COLORS, BADGE_PRIORITY, BADGE_TEXT_COLOR, BADGE_TITLES, BADGE_WORKING, sameBadge } from '../../src/background/activity-badge';
import type { WebActivityObservation, WebAttentionReason } from '../../src/shared/activity';

const now = 1_000_000;
let tab = 0;
const observation = (state: WebActivityObservation['state'], patch: Partial<WebActivityObservation> = {}): WebActivityObservation => ({ id: crypto.randomUUID(), provider: 'chatgpt-web', tabId: ++tab, windowId: 1, sessionNumber: tab, state, provenance: 'observed_ui', observedAt: 1, validUntil: now + 5_000, stateSince: now - 60_000, ...patch });
const attention = (reason: WebAttentionReason, acknowledged = false, patch: Partial<WebActivityObservation> = {}) => observation('attention', { attention: { id: crypto.randomUUID(), reason, acknowledged, raisedAt: now - 1_000 }, ...patch });
const working = (patch: Partial<WebActivityObservation> = {}) => observation('working', patch);
// WCAG 2.x relative luminance and contrast ratio of two #RRGGBB colors.
const luminance = (hex: string) => { const [r, g, b] = [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16) / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a: string, b: string) => { const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (light + 0.05) / (dark + 0.05); };

describe('toolbar badge rules', () => {
  it.each([
    ['nothing observed', [], '', 'Pilovo'],
    ['idle and unknown only', [observation('idle'), observation('unknown', { unknownReason: 'no_evidence' })], '', 'Pilovo'],
    ['working only', [working(), working(), observation('idle')], BADGE_WORKING, 'Pilovo — 2 en cours'],
    ['response ready', [attention('response_ready'), observation('idle')], '1', 'Pilovo — 1 à vérifier (réponse disponible)'],
    ['input plus ready', [attention('response_ready'), attention('input_required'), attention('response_ready')], '3', 'Pilovo — 3 à vérifier, dont 1 intervention demandée'],
    ['error plus others', [attention('input_required'), working(), attention('error_visible'), attention('response_ready'), attention('error_visible')], '4', 'Pilovo — 4 à vérifier, dont 2 erreurs visibles · 1 en cours'],
    ['acknowledged only', [attention('error_visible', true), attention('response_ready', true)], '', 'Pilovo'],
    ['acknowledged next to work', [attention('error_visible', true), working()], BADGE_WORKING, 'Pilovo — 1 en cours'],
    ['expired attention and work', [attention('error_visible', false, { validUntil: now }), working({ validUntil: now - 1 }), attention('input_required', false, { validUntil: Number.NaN })], '', 'Pilovo'],
    ['expired error next to live ready', [attention('error_visible', false, { validUntil: now }), attention('response_ready')], '1', 'Pilovo — 1 à vérifier (réponse disponible)'],
  ] as const)('%s', (_name, observations, text, title) => {
    const badge = activityBadge(observations, now, 'fr');
    expect(badge).toMatchObject({ text, title, textColor: BADGE_TEXT_COLOR });
    if (text === BADGE_WORKING) expect(badge.background).toBe(BADGE_COLORS.working);
  });
  it('colors a count by the most urgent unacknowledged reason, whatever the order or the acknowledged rows', () => {
    const color = (...observations: WebActivityObservation[]) => activityBadge(observations, now, 'en').background;
    expect(color(attention('response_ready'))).toBe(BADGE_COLORS.response_ready);
    expect(color(attention('response_ready'), attention('input_required'))).toBe(BADGE_COLORS.input_required);
    expect(color(attention('input_required'), attention('response_ready'))).toBe(BADGE_COLORS.input_required);
    expect(color(attention('response_ready'), attention('error_visible'), attention('input_required'))).toBe(BADGE_COLORS.error_visible);
    expect(color(attention('error_visible', true), attention('response_ready'), working())).toBe(BADGE_COLORS.response_ready);
    expect(BADGE_PRIORITY).toEqual(['error_visible', 'input_required', 'response_ready']);
  });
  it('shows the ellipsis only when work is live and nothing needs review', () => {
    expect(BADGE_WORKING).toBe('\u2026'); expect(BADGE_WORKING.codePointAt(0)).toBe(0x2026); expect(BADGE_WORKING).toHaveLength(1);
    expect(activityBadge([working()], now, 'fr')).toEqual({ text: '…', background: BADGE_COLORS.working, textColor: BADGE_TEXT_COLOR, title: 'Pilovo — 1 en cours' });
    expect(activityBadge([working(), attention('response_ready')], now, 'fr').text).toBe('1');
    expect(activityBadge([working({ validUntil: now })], now, 'fr').text).toBe('');
  });
  it('keeps the count semantics: one per unacknowledged live attention', () => {
    const many = Array.from({ length: 12 }, (_, index) => attention(BADGE_PRIORITY[index % 3]));
    expect(activityBadge([...many, attention('error_visible', true), working()], now, 'fr').text).toBe('12');
  });
});

describe('toolbar title wording', () => {
  it.each([
    [{ review: 0, working: 0 }, 'Pilovo', 'Pilovo'],
    [{ review: 0, working: 1 }, 'Pilovo — 1 en cours', 'Pilovo — 1 working'],
    [{ review: 0, working: 3 }, 'Pilovo — 3 en cours', 'Pilovo — 3 working'],
    [{ review: 1, urgent: { reason: 'response_ready', count: 1 }, working: 0 }, 'Pilovo — 1 à vérifier (réponse disponible)', 'Pilovo — 1 to review (response available)'],
    [{ review: 2, urgent: { reason: 'response_ready', count: 2 }, working: 1 }, 'Pilovo — 2 à vérifier (réponses disponibles) · 1 en cours', 'Pilovo — 2 to review (responses available) · 1 working'],
    [{ review: 1, urgent: { reason: 'input_required', count: 1 }, working: 2 }, 'Pilovo — 1 à vérifier (intervention demandée) · 2 en cours', 'Pilovo — 1 to review (input request) · 2 working'],
    [{ review: 2, urgent: { reason: 'input_required', count: 2 }, working: 0 }, 'Pilovo — 2 à vérifier (interventions demandées)', 'Pilovo — 2 to review (input requests)'],
    [{ review: 3, urgent: { reason: 'input_required', count: 2 }, working: 0 }, 'Pilovo — 3 à vérifier, dont 2 interventions demandées', 'Pilovo — 3 to review, including 2 input requests'],
    [{ review: 1, urgent: { reason: 'error_visible', count: 1 }, working: 0 }, 'Pilovo — 1 à vérifier (erreur visible)', 'Pilovo — 1 to review (visible error)'],
    [{ review: 2, urgent: { reason: 'error_visible', count: 1 }, working: 1 }, 'Pilovo — 2 à vérifier, dont 1 erreur visible · 1 en cours', 'Pilovo — 2 to review, including 1 visible error · 1 working'],
    [{ review: 5, urgent: { reason: 'error_visible', count: 2 }, working: 4 }, 'Pilovo — 5 à vérifier, dont 2 erreurs visibles · 4 en cours', 'Pilovo — 5 to review, including 2 visible errors · 4 working'],
  ] as const)('%j', (counts, fr, en) => {
    expect(badgeTitle(counts, 'fr')).toBe(fr); expect(badgeTitle(counts, 'en')).toBe(en);
  });
  it('stays under 80 characters at implausibly high counts in both languages', () => {
    for (const language of ['fr', 'en'] as const) for (const reason of BADGE_PRIORITY) {
      for (const count of [998, 999]) expect(badgeTitle({ review: 999, urgent: { reason, count }, working: 999 }, language).length).toBeLessThanOrEqual(80);
    }
  });
  it('contains only counts and fixed words, never provider, tab or page data', () => {
    const fixed = Object.values(BADGE_TITLES).flatMap(words => [words.review, words.working, words.including, ...Object.values(words.reasons).flat()]).sort((a, b) => b.length - a.length);
    for (const language of ['fr', 'en'] as const) {
      const badge = activityBadge([attention('error_visible', false, { provider: 'claude-web', tabId: 987654, windowId: 123456 }), attention('response_ready'), working()], now, language);
      let rest = badge.title.replace(/^Pilovo/, '');
      for (const words of fixed) rest = rest.replaceAll(words, '');
      expect(rest.replace(/\d+/g, '').replace(/[ —·,()]/g, '')).toBe('');
      expect(JSON.stringify(badge)).not.toMatch(/claude|chatgpt|987654|123456/i);
    }
  });
  it('follows the app language with French as the default', () => {
    expect([activityLanguage('en'), activityLanguage('fr'), activityLanguage('de'), activityLanguage(undefined), activityLanguage({ language: 'en' })]).toEqual(['en', 'fr', 'fr', 'fr', 'fr']);
    expect(activityBadge([working()], now, 'en').title).toBe('Pilovo — 1 working');
  });
});

describe('toolbar badge colors', () => {
  it('give white text a computed contrast of at least 4.5:1 on every background', () => {
    expect(BADGE_TEXT_COLOR).toBe('#FFFFFF');
    expect(contrast('#FFFFFF', '#000000')).toBeCloseTo(21, 5); expect(contrast('#777777', '#FFFFFF')).toBeLessThan(4.5);
    for (const [name, background] of Object.entries(BADGE_COLORS)) {
      expect(background, name).toMatch(/^#[0-9A-F]{6}$/);
      expect(contrast(background, BADGE_TEXT_COLOR), name).toBeGreaterThanOrEqual(4.5);
    }
    expect(BADGE_COLORS.response_ready).toBe('#4B5D3A');
  });
  it('are distinct per meaning, and every lit badge pairs one of them with white text', () => {
    expect(new Set(Object.values(BADGE_COLORS)).size).toBe(4);
    for (const reason of BADGE_PRIORITY) expect(activityBadge([attention(reason)], now, 'fr')).toMatchObject({ background: BADGE_COLORS[reason], textColor: BADGE_TEXT_COLOR });
  });
  it('compares painted values field by field', () => {
    const badge = activityBadge([working()], now, 'fr');
    expect(sameBadge(badge, { ...badge })).toBe(true);
    for (const key of ['text', 'background', 'textColor', 'title'] as const) expect(sameBadge(badge, { ...badge, [key]: 'x' })).toBe(false);
  });
});
