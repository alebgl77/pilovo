import { ACTIVITY_TTL, activityHintSchema, activitySampleSchema, monotonicEpoch, type ActivityLease, type WebActivitySnapshot } from '../shared/activity';
import { WEB_PROVIDERS, type WebProvider } from '../shared/web';
import { HubError } from '../shared/errors';
import { eligibleWebTab, matchesWebProvider, type WebTab } from '../platform/web';
import { makeUnknown, newActivityRecord, reduceActivity, type ActivityRecord } from './activity-reducer';
import { disposeInstalledController, sampleInstalledController } from './activity-injection';
import { activityBadge, activityLanguage, sameBadge, type ActivityBadge, type ActivityLanguage } from './activity-badge';

export interface ActivityAccess {
  runtimeId: string;
  hasPermission(provider: WebProvider): Promise<boolean>;
  tabs(provider: WebProvider): Promise<WebTab[]>;
  tab(id: number): Promise<WebTab>;
  register(provider: WebProvider): Promise<void>;
  unregister(provider: WebProvider): Promise<void>;
  install(tabId: number): Promise<void>;
  sample(tabId: number, lease: ActivityLease): Promise<{ documentId?: string; frameId: number; result?: unknown }[]>;
  dispose(tabId: number, grantId: string): Promise<void>;
  focus(provider: WebProvider, tabId: number, stillCurrent: () => boolean): Promise<void>;
  badge(badge: ActivityBadge): Promise<void>;
  notify(): void;
  now(): number; wall(): number;
}
interface Grant { enabled: boolean; id: string; revision: number; queue: Promise<void> }
interface Slot { generation: number; operation: number; inFlight: boolean; pending: boolean; lastStarted: number; desiredProvider?: WebProvider; timer?: ReturnType<typeof setTimeout>; settled?: Promise<void>; focusing?: number }
interface HintSender { id?: string; frameId?: number; documentId?: string; documentLifecycle?: string; url?: string; tab?: WebTab }

export class WebActivity {
  private readonly workerId = crypto.randomUUID();
  private readonly grants = new Map<WebProvider, Grant>(WEB_PROVIDERS.map(provider => [provider.id, { enabled: false, id: crypto.randomUUID(), revision: 0, queue: Promise.resolve() }]));
  private readonly records = new Map<number, ActivityRecord>();
  private readonly slots = new Map<number, Slot>();
  private readonly sequences = new Map<number, { documentId: string; activationId: string; sequence: number }>();
  private expiry?: ReturnType<typeof setTimeout>;
  private focusing?: Promise<'focused' | 'none' | 'failed'>;
  private badgeQueue = Promise.resolve();
  private painted?: ActivityBadge;
  private language: ActivityLanguage = 'fr';
  private available = true;
  // The first paint of each worker life clears a badge and title left by a previous one.
  constructor(private readonly access: ActivityAccess) { this.paintBadge(); }

  /** Follows the app's language setting (not the browser's). Only the toolbar title depends on it. */
  setLanguage(language: unknown) {
    const next = activityLanguage(language);
    if (next !== this.language) { this.language = next; this.paintBadge(); }
  }

  start() { for (const provider of WEB_PROVIDERS) this.reconcile(provider.id); }
  // Each provider has one serialized registration queue. Old revoke/unregister operations cannot race a regrant.
  reconcile(provider: WebProvider) {
    const grant = this.grants.get(provider)!;
    const revision = ++grant.revision;
    grant.queue = grant.queue.catch(() => undefined).then(async () => {
      if (revision !== grant.revision) return;
      const allowed = await this.access.hasPermission(provider).catch(() => false);
      if (revision !== grant.revision) return;
      if (!allowed) { this.invalidateGrant(provider); await this.access.unregister(provider).catch(() => undefined); return; }
      if (!grant.enabled) {
        await this.access.unregister(provider).catch(() => undefined);
        if (revision !== grant.revision) return;
        const stillAllowed = await this.access.hasPermission(provider);
        if (!stillAllowed || revision !== grant.revision) return;
        grant.enabled = true; grant.id = crypto.randomUUID();
        try { await this.access.register(provider); }
        catch { grant.enabled = false; this.available = false; this.changed(); return; }
        if (revision !== grant.revision) return;
      }
      this.available = true;
      await this.refresh(provider);
    }).catch(() => { this.available = false; this.changed(); });
  }
  revoke(provider: WebProvider) {
    const grant = this.grants.get(provider)!;
    const oldGrant = grant.id;
    const tabIds = [...this.records].filter(([, record]) => record.observation.provider === provider).map(([id]) => id);
    ++grant.revision; this.invalidateGrant(provider);
    grant.queue = grant.queue.catch(() => undefined).then(async () => {
      await this.access.unregister(provider).catch(() => undefined);
      await Promise.all(tabIds.map(id => this.access.dispose(id, oldGrant).catch(() => undefined)));
    });
  }
  private invalidateGrant(provider: WebProvider) {
    const grant = this.grants.get(provider)!; grant.enabled = false; grant.id = crypto.randomUUID();
    for (const [tabId, record] of this.records) if (record.observation.provider === provider) this.invalidateTab(tabId, true);
    // Jobs not yet represented by a record must also fail the grant identity check.
    this.changed();
  }
  async refresh(provider?: WebProvider) {
    for (const entry of WEB_PROVIDERS.filter(item => !provider || item.id === provider)) {
      const grant = this.grants.get(entry.id)!;
      if (!grant.enabled) continue;
      const id = grant.id;
      try {
        if (!await this.access.hasPermission(entry.id)) { this.revoke(entry.id); continue; }
        const tabs = await this.access.tabs(entry.id);
        if (!grant.enabled || id !== grant.id) continue;
        for (const tab of tabs) if (eligibleWebTab(tab, entry.id)) this.schedule(tab.id!, entry.id);
      } catch { this.available = false; }
    }
    this.expire();
  }
  async hint(message: unknown, sender: HintSender): Promise<void> {
    const parsed = activityHintSchema.safeParse(message);
    if (!parsed.success || sender.id !== this.access.runtimeId || sender.frameId !== 0 || !sender.documentId || sender.documentLifecycle !== 'active' || !sender.tab || sender.tab.incognito) return;
    const provider = WEB_PROVIDERS.find(item => matchesWebProvider(sender.url, item.id) && eligibleWebTab(sender.tab!, item.id))?.id;
    if (!provider || !this.grants.get(provider)!.enabled) return;
    const grantId = this.grants.get(provider)!.id;
    if (!await this.access.hasPermission(provider).catch(() => false) || grantId !== this.grants.get(provider)!.id) return;
    const tabId = sender.tab.id!;
    const previous = this.sequences.get(tabId);
    if (previous?.documentId === sender.documentId && previous.activationId === parsed.data.activationId && previous.sequence >= parsed.data.sequence) return;
    this.sequences.set(tabId, { documentId: sender.documentId, activationId: parsed.data.activationId, sequence: parsed.data.sequence });
    // A hint does not identify the target document or provide authoritative state.
    this.schedule(tabId, provider);
  }
  invalidateTab(tabId: number, remove = false) {
    const slot = this.slots.get(tabId);
    if (slot) { slot.generation++; slot.operation++; slot.pending = false; clearTimeout(slot.timer); slot.timer = undefined; }
    this.sequences.delete(tabId);
    const record = this.records.get(tabId);
    if (remove) { this.records.delete(tabId); this.slots.delete(tabId); }
    else if (record) {
      this.records.set(tabId, newActivityRecord(record.observation.provider, tabId, record.observation.windowId, '', this.access.now(), this.access.wall()));
      makeUnknown(this.records.get(tabId)!, 'navigation', this.access.now());
    }
    this.changed();
  }
  updateTab(tabId: number, change: { url?: string; status?: string; discarded?: boolean; frozen?: boolean }, tab?: WebTab) {
    if (change.url !== undefined || change.status === 'loading' || change.discarded || change.frozen) this.invalidateTab(tabId);
    if (tab) {
      const provider = WEB_PROVIDERS.find(item => eligibleWebTab(tab, item.id))?.id;
      if (!provider) this.invalidateTab(tabId, true);
      else if (!tab.discarded && !tab.frozen && tab.status !== 'loading') this.schedule(tabId, provider);
    }
  }
  private schedule(tabId: number, provider: WebProvider) {
    if (!this.grants.get(provider)!.enabled) return;
    let slot = this.slots.get(tabId);
    if (!slot) { slot = { generation: 0, operation: 0, inFlight: false, pending: false, lastStarted: -Infinity }; this.slots.set(tabId, slot); }
    slot.pending = true;
    slot.desiredProvider = provider;
    // A pending focus owns the next sample; hints stay pending and are rescheduled once it ends.
    if (slot.inFlight || slot.timer || slot.focusing) return;
    const wait = Math.max(0, 1_000 - (this.access.now() - slot.lastStarted));
    slot.timer = setTimeout(() => { slot!.timer = undefined; void this.sample(tabId, slot!.desiredProvider!, slot!); }, wait);
  }
  private async sample(tabId: number, provider: WebProvider, slot: Slot) {
    const grant = this.grants.get(provider)!;
    if (!grant.enabled || slot.inFlight) return false;
    slot.pending = false; slot.inFlight = true; slot.lastStarted = this.access.now();
    let release!: () => void; slot.settled = new Promise(resolve => { release = resolve; });
    const generation = slot.generation, operation = ++slot.operation, grantId = grant.id;
    const current = () => grant.enabled && grant.id === grantId && slot.generation === generation && slot.operation === operation;
    // Absolute lease starts before any asynchronous permission or injection work.
    const lease: ActivityLease = { workerId: this.workerId, grantId, requestId: crypto.randomUUID(), issuedAt: this.access.now(), expiresAt: this.access.now() + ACTIVITY_TTL };
    lease.expiresAt = lease.issuedAt + ACTIVITY_TTL;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let committed = false;
    const eligible = (tab: WebTab) => tab.id === tabId && eligibleWebTab(tab, provider) && !tab.discarded && !tab.frozen && tab.status !== 'loading' && (!tab.pendingUrl || tab.pendingUrl === tab.url);
    const work = async () => {
      if (!await this.access.hasPermission(provider) || !current()) return;
      let tab = await this.access.tab(tabId);
      if (!eligible(tab) || !current()) return;
      let results = await this.access.sample(tabId, lease);
      if (!current()) return;
      if (!results[0]?.result) {
        await this.access.install(tabId);
        if (!current() || !await this.access.hasPermission(provider)) return;
        results = await this.access.sample(tabId, lease);
      }
      if (!current() || !await this.access.hasPermission(provider) || !current()) return;
      tab = await this.access.tab(tabId);
      if (!current() || !eligible(tab) || this.access.now() >= lease.expiresAt) return;
      const result = results.length === 1 ? results[0] : undefined;
      const parsed = activitySampleSchema.safeParse(result?.result);
      if (!result?.documentId || result.frameId !== 0 || !parsed.success || parsed.data.requestId !== lease.requestId) throw new Error('Invalid sample');
      const identity = [this.workerId, grantId, generation, result.documentId, parsed.data.activationId].join(':');
      let record = this.records.get(tabId);
      if (!record || record.identity !== identity || this.access.now() >= record.observation.validUntil) record = newActivityRecord(provider, tabId, tab.windowId, identity, this.access.now(), this.access.wall());
      record.observation.windowId = tab.windowId;
      reduceActivity(record, parsed.data.evidence, this.access.now(), this.access.wall(), lease.expiresAt);
      this.records.set(tabId, record);
      committed = true;
      if (record.idleSince !== undefined) slot.pending = true;
      this.changed();
    };
    try {
      await Promise.race([work(), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Sample timeout')), 2_000); })]);
    } catch {
      if (current()) { const record = this.records.get(tabId); if (record) makeUnknown(record, 'unavailable', this.access.now()); this.changed(); }
    } finally {
      clearTimeout(timer);
      // Invalidates late work even when Chrome completes an injection after the timeout.
      if (slot.operation === operation) slot.operation++;
      slot.inFlight = false; release();
      if (slot.pending && slot.desiredProvider && this.grants.get(slot.desiredProvider)!.enabled) this.schedule(tabId, slot.desiredProvider);
    }
    return committed;
  }
  snapshot(): WebActivitySnapshot {
    this.expire();
    return { availability: this.available ? 'available' : 'unavailable', observations: [...this.records.values()].map(record => structuredClone(record.observation)), observedAt: this.access.wall() };
  }
  /** With attentionId (keyboard command), the fresh sample must still show that unacknowledged attention. */
  async focus(id: string, attentionId?: string) {
    this.expire();
    const record = [...this.records.values()].find(item => item.observation.id === id);
    if (!record || record.observation.validUntil <= this.access.now()) throw new HubError('navigation.expired');
    const { provider, tabId } = record.observation;
    const slot = this.slots.get(tabId), grant = this.grants.get(provider)!;
    if (!slot) throw new HubError('navigation.changed');
    const generation = slot.generation, grantId = grant.id, identity = record.identity;
    const attended = () => !attentionId || record.observation.state === 'attention' && record.observation.attention?.id === attentionId && !record.observation.attention.acknowledged;
    const current = () => this.records.get(tabId) === record && record.identity === identity && slot.generation === generation && this.access.now() < record.observation.validUntil && grant.enabled && grant.id === grantId && attended();
    if (!current()) throw new HubError('navigation.expired');
    // Focus must verify a newly sampled current top frame, even if Chrome's navigation event is still queued.
    // Respect the same per-tab rate bound; an already in-flight job cannot substitute for this fresh proof.
    // While focus waits, routine hints only mark the slot pending, so they cannot take the slot from it.
    slot.focusing = (slot.focusing || 0) + 1;
    try {
      clearTimeout(slot.timer); slot.timer = undefined;
      // A routine sample already in flight settles within its own 2 s timeout; focus then takes its own sample.
      if (slot.inFlight) await slot.settled;
      const wait = Math.max(0, 1_000 - (this.access.now() - slot.lastStarted));
      if (wait) await new Promise(resolve => setTimeout(resolve, wait));
      if (!current() || slot.inFlight) throw new HubError('navigation.changed');
      if (!await this.sample(tabId, provider, slot) || !current()) throw new HubError('navigation.changed');
      await this.access.focus(provider, tabId, current);
    } finally {
      slot.focusing!--;
      if (!slot.focusing && this.slots.get(tabId) === slot && slot.pending && slot.desiredProvider && this.grants.get(slot.desiredProvider)!.enabled) this.schedule(tabId, slot.desiredProvider);
    }
  }
  acknowledge(id: string, attentionId: string) {
    this.expire();
    const record = [...this.records.values()].find(item => item.observation.id === id);
    if (!record || record.observation.validUntil <= this.access.now() || record.observation.attention?.id !== attentionId) throw new HubError('navigation.expired');
    record.observation.attention.acknowledged = true; this.changed();
  }
  /** Live, unacknowledged attention in raise order; ties use the lower tab ID. Returns the stored observations. */
  pendingAttention() {
    const now = this.access.now();
    return [...this.records.values()].map(record => record.observation)
      .filter(observation => observation.validUntil > now && observation.state === 'attention' && observation.attention && !observation.attention.acknowledged)
      .sort((a, b) => a.attention!.raisedAt - b.attention!.raisedAt || a.tabId - b.tabId);
  }
  // Repeated key presses join the running attempt instead of racing it onto a later candidate.
  focusNextAttention(): Promise<'focused' | 'none' | 'failed'> {
    return this.focusing ??= this.focusNext().finally(() => { this.focusing = undefined; });
  }
  private async focusNext(): Promise<'focused' | 'none' | 'failed'> {
    this.expire();
    const candidates = this.pendingAttention().map(observation => [observation.id, observation.attention!.id] as const);
    let attempted = false;
    // Bounded by the initial candidates. Each attempt is the ordinary focus(): fresh sample, identity and grant checks,
    // plus the same attention still unacknowledged in that sample.
    for (const [id, attentionId] of candidates) {
      if (!this.pendingAttention().some(observation => observation.id === id && observation.attention!.id === attentionId)) continue;
      attempted = true;
      try { await this.focus(id, attentionId); return 'focused'; } catch { /* The next candidate may still be valid. */ }
    }
    return attempted ? 'failed' : 'none';
  }
  /** Local seen only, as acknowledge(). Optional IDs limit it to the attention identities the user was shown. */
  acknowledgeAll(attentionIds?: readonly string[]) {
    this.expire();
    const shown = attentionIds && new Set(attentionIds);
    let count = 0;
    for (const observation of this.pendingAttention()) if (!shown || shown.has(observation.attention!.id)) { observation.attention!.acknowledged = true; count++; }
    this.changed();
    return count;
  }
  expire() {
    let changed = false;
    for (const record of this.records.values()) if (record.observation.validUntil <= this.access.now() && record.observation.unknownReason !== 'expired' && record.observation.unknownReason !== 'navigation') { makeUnknown(record, 'expired', this.access.now()); changed = true; }
    // Nothing expired yet (the watchdog may run a fraction of a millisecond early): watch the next deadline again.
    if (changed) this.changed(); else this.arm();
  }
  // Serialized paints; an unchanged value makes no Chrome call. A failed paint is forgotten, so the next change retries it.
  private paintBadge() {
    const badge = activityBadge([...this.records.values()].map(record => record.observation), this.access.now(), this.language);
    if (this.painted && sameBadge(this.painted, badge)) return;
    this.painted = badge;
    this.badgeQueue = this.badgeQueue.catch(() => undefined).then(() => this.access.badge(badge)).catch(() => { if (this.painted === badge) this.painted = undefined; });
  }
  private changed() { this.paintBadge(); this.access.notify(); this.arm(); }
  // The clock is fractional and setTimeout truncates its delay, so the watchdog rounds up past the earliest validUntil.
  private arm() {
    clearTimeout(this.expiry);
    const now = this.access.now();
    const active = [...this.records.values()].map(record => record.observation).filter(observation => observation.validUntil > now);
    if (active.length) this.expiry = setTimeout(() => this.expire(), Math.max(1, Math.ceil(Math.min(...active.map(observation => observation.validUntil)) - now) + 1));
  }
}

export function chromeActivityAccess(focus: ActivityAccess['focus'], notify: () => void): ActivityAccess {
  const providerInfo = (provider: WebProvider) => WEB_PROVIDERS.find(item => item.id === provider)!;
  const registration = (provider: WebProvider) => `pilovo-observer-${provider}`;
  let shown: Partial<ActivityBadge> = {};
  return {
    runtimeId: chrome.runtime.id, now: monotonicEpoch, wall: Date.now, focus, notify,
    hasPermission: provider => chrome.permissions.contains({ origins: [providerInfo(provider).pattern] }),
    tabs: provider => chrome.tabs.query({ url: [providerInfo(provider).pattern] }), tab: id => chrome.tabs.get(id),
    register: provider => chrome.scripting.registerContentScripts([{ id: registration(provider), js: ['observer.js'], matches: [providerInfo(provider).pattern], allFrames: false, runAt: 'document_idle', world: 'ISOLATED', persistAcrossSessions: false }]),
    unregister: async provider => { await chrome.scripting.unregisterContentScripts({ ids: [registration(provider)] }); },
    install: async tabId => { await chrome.scripting.executeScript({ target: { tabId, frameIds: [0] }, world: 'ISOLATED', files: ['observer.js'] }); },
    sample: (tabId, lease) => chrome.scripting.executeScript({ target: { tabId, frameIds: [0] }, world: 'ISOLATED', func: sampleInstalledController, args: [lease] }),
    dispose: async (tabId, grantId) => { await chrome.scripting.executeScript({ target: { tabId, frameIds: [0] }, world: 'ISOLATED', func: disposeInstalledController, args: [grantId] }); },
    badge: async badge => {
      // Only the parts that differ from what this worker last painted are sent. Colors precede the text so a badge never
      // appears in the previous color; a hidden badge leaves them as they are. After a failure, everything is resent.
      try {
        if (badge.text && shown.background !== badge.background) { await chrome.action.setBadgeBackgroundColor({ color: badge.background }); shown.background = badge.background; }
        // Chrome 110+ (the manifest requires 120); without it Chrome picks a readable text color itself.
        if (badge.text && shown.textColor !== badge.textColor && typeof chrome.action.setBadgeTextColor === 'function') { await chrome.action.setBadgeTextColor({ color: badge.textColor }); shown.textColor = badge.textColor; }
        if (shown.text !== badge.text) { await chrome.action.setBadgeText({ text: badge.text }); shown.text = badge.text; }
        if (shown.title !== badge.title) { await chrome.action.setTitle({ title: badge.title }); shown.title = badge.title; }
      } catch (error) { shown = {}; throw error; }
    },
  };
}
