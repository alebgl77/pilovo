import { ACTIVITY_TTL, activityHintSchema, activityLabelSchema, activitySampleSchema, autoAcknowledgeSchema, monotonicEpoch, type ActivityLease, type AutoAcknowledgeSeconds, type WebActivityObservation, type WebActivitySnapshot, type WebAttentionReason } from '../shared/activity';
import { notifyProvidersSchema, WEB_PROVIDERS, type WebProvider } from '../shared/web';
import { HubError } from '../shared/errors';
import { eligibleWebTab, matchesWebProvider, type WebTab } from '../platform/web';
import { makeUnknown, newActivityRecord, reduceActivity, type ActivityRecord } from './activity-reducer';
import { disposeInstalledController, sampleInstalledController } from './activity-injection';
import { activityBadge, activityLanguage, sameBadge, type ActivityBadge, type ActivityLanguage } from './activity-badge';
import { activityNotice, isNoticeId, NOTICE_GRACE, NOTICE_LIMIT, NOTICE_RESAMPLE, noticeId, NOTIFIED_LIMIT, NOTIFICATION_PERMISSION, parseNoticeId, remember, type ActivityNotice } from './activity-notifications';

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
  /** The active tab of Chrome's focused window, or undefined when no browser window has focus. IDs only, no page access. */
  viewing(): Promise<ActivityView | undefined>;
  /** Optional OS notifications: whether Chrome currently grants the optional notifications permission. */
  canNotify(): Promise<boolean>;
  showNotification(id: string, notice: ActivityNotice): Promise<void>;
  clearNotification(id: string): Promise<void>;
  /** IDs of this extension's notifications still shown, including any a previous worker life left. */
  shownNotifications(): Promise<string[]>;
  /** Tells open panels that something changed (hub.changed); unrelated to OS notifications. */
  notify(): void;
  now(): number; wall(): number;
}
interface Grant { enabled: boolean; id: string; revision: number; queue: Promise<void> }
interface Slot { generation: number; operation: number; inFlight: boolean; pending: boolean; lastStarted: number; desiredProvider?: WebProvider; timer?: ReturnType<typeof setTimeout>; settled?: Promise<void>; focusing?: number }
interface HintSender { id?: string; frameId?: number; documentId?: string; documentLifecycle?: string; url?: string; tab?: WebTab }
// Tab-level identity, independent of the document: it survives navigation and record replacement in the same tab, and
// ends with the tab, its provider grant, the tab leaving that provider, or this worker. Memory only.
interface Session { provider: WebProvider; number: number; index?: number }
// The user's name for a tab, bound to the tab's lifetime rather than to its number: it outlives the tab leaving its
// provider and coming back, is shown only while the tab is on the provider it was given on, and ends with the tab,
// that provider's grant or this worker. Memory only.
interface Label { provider: WebProvider; text: string }
// What the user is looking at: the active tab of Chrome's focused window.
export interface ActivityView { tabId: number; windowId: number }
// Optional automatic seen: one timer, for the viewed tab only, bound to one attention identity of one record and grant.
interface Dwell { tabId: number; windowId: number; record: ActivityRecord; identity: string; attentionId: string; grantId: string; timer: ReturnType<typeof setTimeout> }
// An OS notification for one attention identity of one record and grant, shown while that attention stays current. When only
// its evidence lapses, it waits until lapsedUntil for the same reason to be raised again in its tab, then stands for that
// new identity: its ID, text and Chrome notification stay as they are.
interface Notice { id: string; tabId: number; provider: WebProvider; reason: WebAttentionReason; record: ActivityRecord; identity: string; attentionId: string; grantId: string; lapsedUntil?: number }
const validIndex = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
const validView = (view: ActivityView | undefined): view is ActivityView => validIndex(view?.tabId) && validIndex(view?.windowId);

export class WebActivity {
  private readonly workerId = crypto.randomUUID();
  private readonly grants = new Map<WebProvider, Grant>(WEB_PROVIDERS.map(provider => [provider.id, { enabled: false, id: crypto.randomUUID(), revision: 0, queue: Promise.resolve() }]));
  private readonly records = new Map<number, ActivityRecord>();
  private readonly slots = new Map<number, Slot>();
  private readonly sequences = new Map<number, { documentId: string; activationId: string; sequence: number }>();
  private readonly sessions = new Map<number, Session>();
  private readonly labels = new Map<number, Label>();
  private positions = 0;
  private expiry?: ReturnType<typeof setTimeout>;
  private focusing?: Promise<'focused' | 'none' | 'failed'>;
  private badgeQueue = Promise.resolve();
  private painted?: ActivityBadge;
  private language: ActivityLanguage = 'fr';
  private available = true;
  private autoAcknowledge: AutoAcknowledgeSeconds = 0;
  // From the last fresh query, cleared by every tab activation or window focus event until the next query answers.
  private view?: ActivityView;
  private views = 0;
  private dwelling?: Dwell;
  // Optional OS notifications: the opted-in services, the live notification of each tab, the attention identities already
  // notified and, per tab, the reason last raised there since the tab last showed work or idle. A revision per service
  // cancels checks still pending when its setting or the permission changes. Memory only.
  private notifyProviders = new Set<WebProvider>();
  private readonly notices = new Map<number, Notice>();
  private readonly notified = new Set<string>();
  private readonly repeats = new Map<number, { provider: WebProvider; reason: WebAttentionReason }>();
  private readonly noticeRevisions = new Map<WebProvider, number>(WEB_PROVIDERS.map(provider => [provider.id, 0]));
  private noticeQueue = Promise.resolve();
  private graceTimer?: ReturnType<typeof setTimeout>;
  // Checks re-run after every change, each until its condition holds or its deadline passes (see until()).
  private readonly waiters = new Set<() => void>();
  // The first paint of each worker life clears a badge and title left by a previous one, and its notifications too.
  constructor(private readonly access: ActivityAccess) { this.paintBadge(); this.clearStaleNotices(); }

  /** Follows the app's language setting (not the browser's). Only the toolbar title and new notifications depend on it. */
  setLanguage(language: unknown) {
    const next = activityLanguage(language);
    if (next !== this.language) { this.language = next; this.paintBadge(); }
  }

  /** Optional automatic seen, from the app's settings: 0 (the default, also for any unexpected value) turns it off.
   * A change restarts any dwell from the currently viewed tab. */
  setAutoAcknowledge(seconds: unknown) {
    const parsed = autoAcknowledgeSchema.safeParse(seconds), next = parsed.success ? parsed.data : 0;
    if (next !== this.autoAcknowledge) { this.autoAcknowledge = next; this.viewChanged(); }
  }
  /** Optional OS notifications, from the app's settings: the services to notify for; anything unexpected means none.
   * Attention raised before a service is added is never notified; removing it clears its notifications. */
  setNotifyProviders(providers: unknown) {
    const parsed = notifyProvidersSchema.safeParse(providers), next = new Set<WebProvider>(parsed.success ? parsed.data : []);
    let changed = false;
    for (const { id } of WEB_PROVIDERS) if (next.has(id) !== this.notifyProviders.has(id)) { this.noticeRevisions.set(id, this.noticeRevisions.get(id)! + 1); changed = true; }
    if (changed) { this.notifyProviders = next; this.syncNotices(); }
  }
  /** Chrome no longer grants the optional notifications permission: pending checks stop and every notification is
   * forgotten. Chrome refuses notification calls once the permission is gone, so the clears attempted here can fail: the
   * Settings page clears them first, through setNotifyProviders, before it removes the permission itself. */
  notificationsRevoked() {
    for (const { id } of WEB_PROVIDERS) this.noticeRevisions.set(id, this.noticeRevisions.get(id)! + 1);
    for (const tabId of [...this.notices.keys()]) this.dismiss(tabId);
  }
  /** Chrome grants the permission again: notifications that a removal elsewhere left on screen can be cleared now. */
  notificationsGranted() { this.clearStaleNotices(); }
  /** Resolves once every create and clear requested so far has reached Chrome. */
  noticesSettled(): Promise<void> { return this.noticeQueue; }
  /** A click on a Pilovo notification runs the ordinary focus of the attention it stands for: a fresh sample must still
   * show it, unacknowledged, in the same record. A notification whose evidence lapsed first has its tab sampled again: only
   * the same reason raised there again within its grace period is focused. It is never a seen acknowledgment. The
   * notification is cleared whether focus succeeds or not; an ID this worker could not have made is ignored. */
  async notificationClicked(id: unknown): Promise<'focused' | 'failed' | 'ignored'> {
    const parsed = parseNoticeId(id);
    if (!parsed) return 'ignored';
    // Evidence that expired just now first moves its notification into the grace period.
    this.expire();
    const tabId = this.noticeTab(id as string), notice = tabId === undefined ? undefined : this.notices.get(tabId);
    if (tabId !== undefined) this.dismiss(tabId); else this.clearNotice(id as string);
    try {
      if (notice?.lapsedUntil !== undefined) {
        this.schedule(notice.tabId, notice.provider);
        await this.until(() => Boolean(this.continuation(notice)) || !this.lapsing(notice), NOTICE_RESAMPLE);
        const record = this.continuation(notice);
        if (!record) return 'failed';
        await this.focus(record.observation.id, record.observation.attention!.id);
      } else if (notice) await this.focus(notice.record.observation.id, notice.attentionId);
      else await this.focus(parsed.observationId, parsed.attentionId);
      return 'focused';
    } catch { return 'failed'; }
  }
  /** Closed by the user, the system or a clear: forgotten, without another call to Chrome. */
  notificationClosed(id: unknown) {
    const tabId = typeof id === 'string' ? this.noticeTab(id) : undefined;
    if (tabId !== undefined) this.notices.delete(tabId);
  }

  /** Chrome's tab activation or window focus changed (windowId < 0: WINDOW_ID_NONE, Chrome lost focus). Any dwell stops
   * at once; while automatic seen is on, a fresh query then says which tab is viewed. Off, Chrome is never queried. */
  viewChanged(windowId?: number) {
    const pass = ++this.views;
    this.view = undefined; this.dwell();
    if (!this.autoAcknowledge || windowId !== undefined && windowId < 0) return;
    void this.access.viewing().catch(() => undefined).then(view => { if (pass === this.views) { this.view = validView(view) ? { tabId: view.tabId, windowId: view.windowId } : undefined; this.dwell(); } });
  }
  /** A tab was activated, attached or detached in that window. An event that concerns neither the viewed tab nor the viewed
   * window cannot change the focused window's active tab, so a running dwell continues (a focus change has its own event,
   * and the deadline asks Chrome again anyway); any other event is a view change. */
  tabViewChanged(tabId: number, windowId: number) {
    const view = this.view;
    if (view && validIndex(tabId) && validIndex(windowId) && tabId !== view.tabId && windowId !== view.windowId) return;
    this.viewChanged();
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
    for (const [tabId, record] of this.records) if (record.observation.provider === provider) this.release(tabId);
    for (const [tabId, session] of this.sessions) if (session.provider === provider) this.sessions.delete(tabId);
    for (const [tabId, label] of this.labels) if (label.provider === provider) this.labels.delete(tabId);
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
  /** remove: the tab closed or was replaced, so everything bound to it goes, its label included. */
  invalidateTab(tabId: number, remove = false) {
    if (remove) { this.labels.delete(tabId); this.release(tabId); return; }
    this.reset(tabId);
    const record = this.records.get(tabId);
    if (record) {
      this.records.set(tabId, newActivityRecord(record.observation.provider, tabId, record.observation.windowId, '', this.access.now(), this.access.wall()));
      makeUnknown(this.records.get(tabId)!, 'navigation', this.access.now());
    }
    this.changed();
  }
  private reset(tabId: number) {
    const slot = this.slots.get(tabId);
    if (slot) { slot.generation++; slot.operation++; slot.pending = false; clearTimeout(slot.timer); slot.timer = undefined; }
    this.sequences.delete(tabId);
  }
  // The tab is no longer observed for its provider (left it, or its grant ended): its row and number go; a label stays
  // with the open tab unless the caller removes it.
  private release(tabId: number) {
    this.reset(tabId);
    this.records.delete(tabId); this.slots.delete(tabId); this.sessions.delete(tabId); this.repeats.delete(tabId);
    this.changed();
  }
  updateTab(tabId: number, change: { url?: string; status?: string; discarded?: boolean; frozen?: boolean }, tab?: WebTab) {
    if (change.url !== undefined || change.status === 'loading' || change.discarded || change.frozen) this.invalidateTab(tabId);
    if (tab) {
      const provider = WEB_PROVIDERS.find(item => eligibleWebTab(tab, item.id))?.id;
      // Leaving a provider ends that session: its number is released, never carried over to another provider. The label
      // stays with the tab, shown again only if the tab returns to the provider it was given on.
      if (!provider || this.sessions.has(tabId) && this.sessions.get(tabId)!.provider !== provider) this.release(tabId);
      if (provider && !tab.discarded && !tab.frozen && tab.status !== 'loading') this.schedule(tabId, provider);
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
      const session = this.session(tabId, provider);
      if (validIndex(tab.index)) session.index = tab.index;
      const before = record.observation.attention?.id;
      reduceActivity(record, parsed.data.evidence, this.access.now(), this.access.wall(), lease.expiresAt);
      this.records.set(tabId, record);
      committed = true;
      if (record.idleSince !== undefined) slot.pending = true;
      this.changed();
      const attention = record.observation.attention;
      this.attended(tabId, record, attention && attention.id !== before ? attention.reason : undefined);
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
    return { availability: this.available ? 'available' : 'unavailable', observations: [...this.records.values()].map(record => this.present(record)), observedAt: this.access.wall() };
  }
  // A label appears only on its own tab's observation, for the provider it was given on; positions are omitted until
  // Chrome has reported one.
  private present(record: ActivityRecord): WebActivityObservation {
    const { tabId, provider } = record.observation, session = this.session(tabId, provider), label = this.labels.get(tabId);
    return { ...structuredClone(record.observation), sessionNumber: session.number, ...validIndex(session.index) && { tabIndex: session.index }, ...label?.provider === provider && { label: label.text } };
  }
  // Per provider, the smallest positive number no other open tab of that provider holds, assigned at first observation
  // and kept while the tab lives in this worker. Another tab closing never renumbers it.
  private session(tabId: number, provider: WebProvider): Session {
    const current = this.sessions.get(tabId);
    if (current?.provider === provider) return current;
    const taken = new Set([...this.sessions].filter(([id, session]) => id !== tabId && session.provider === provider).map(([, session]) => session.number));
    let number = 1;
    while (taken.has(number)) number++;
    const session: Session = { provider, number };
    this.sessions.set(tabId, session);
    return session;
  }
  /** The user's name for an observed tab, or null to clear it. Worker memory only: kept across navigation in that tab,
   * gone with the tab, its provider grant or this worker; never persisted, exported, or shown on the badge or its title.
   * As for focus and seen, the ID must name a live observation: current and with unexpired evidence. */
  label(id: string, label: string | null) {
    const parsed = activityLabelSchema.nullable().safeParse(label);
    if (!parsed.success) throw new HubError('validation.invalid');
    this.expire();
    const record = [...this.records.values()].find(item => item.observation.id === id);
    if (!record || record.observation.validUntil <= this.access.now()) throw new HubError('navigation.expired');
    const { tabId, provider } = record.observation;
    if (parsed.data === null) this.labels.delete(tabId); else this.labels.set(tabId, { provider, text: parsed.data });
    this.changed();
  }
  /** Opening, closing or moving any tab shifts the positions of others in its window: re-read observed tabs' index and
   * window from Chrome (no page access). Samples refresh them too; a newer pass supersedes an older one. */
  async reindex() {
    const pass = ++this.positions, tabIds = [...this.sessions.keys()];
    const tabs = await Promise.all(tabIds.map(id => this.access.tab(id).catch(() => undefined)));
    if (pass !== this.positions) return;
    let moved = false;
    tabIds.forEach((tabId, index) => {
      const tab = tabs[index], session = this.sessions.get(tabId), record = this.records.get(tabId);
      if (!tab || tab.id !== tabId || !session || !record || !validIndex(tab.index) || !validIndex(tab.windowId)) return;
      if (session.index !== tab.index || record.observation.windowId !== tab.windowId) { session.index = tab.index; record.observation.windowId = tab.windowId; moved = true; }
    });
    if (moved) this.changed();
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
      if (slot.inFlight) { await slot.settled; if (!current()) throw new HubError('navigation.changed'); }
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
  // The user is looking at this attention: unacknowledged, live and current for its grant, on the viewed tab of the
  // focused window. A dwell runs only while this holds for the same record identity and attention identity.
  private watched(dwell: Omit<Dwell, 'timer'>, view: ActivityView | undefined) {
    const { tabId, windowId, record, identity, attentionId, grantId } = dwell, observation = record.observation, grant = this.grants.get(observation.provider)!;
    return this.autoAcknowledge > 0 && view?.tabId === tabId && view.windowId === windowId && observation.windowId === windowId && this.records.get(tabId) === record && record.identity === identity
      && observation.state === 'attention' && observation.attention?.id === attentionId && !observation.attention.acknowledged && observation.validUntil > this.access.now()
      && grant.enabled && grant.id === grantId;
  }
  // Runs on every change and view answer: stops a dwell that no longer holds (tab switch, blur, navigation, closure,
  // a new attention identity, acknowledgment, expiry, revocation, setting off) and starts one when the viewed tab shows an
  // eligible attention, either when it becomes viewed or when it is raised there. Timers live in this worker only.
  private dwell() {
    if (this.dwelling && !this.watched(this.dwelling, this.view)) { clearTimeout(this.dwelling.timer); this.dwelling = undefined; }
    const view = this.view, record = view && this.records.get(view.tabId), attention = record?.observation.attention;
    if (this.dwelling || !view || !record || !attention) return;
    const candidate = { tabId: view.tabId, windowId: view.windowId, record, identity: record.identity, attentionId: attention.id, grantId: this.grants.get(record.observation.provider)!.id };
    if (!this.watched(candidate, view)) return;
    const dwell: Dwell = { ...candidate, timer: setTimeout(() => { void this.dwelled(dwell); }, this.autoAcknowledge * 1_000) };
    this.dwelling = dwell;
  }
  // At the deadline, Chrome is asked again: cached events can be stale or missing. Every condition is then re-checked in
  // one synchronous step before acknowledging exactly that attention identity through the ordinary seen path.
  private async dwelled(dwell: Dwell) {
    if (this.dwelling !== dwell) return;
    const fresh = await this.access.viewing().catch(() => undefined);
    // Any view event or change that stopped this dwell meanwhile wins over the answer.
    if (this.dwelling !== dwell) return;
    this.dwelling = undefined;
    const view = validView(fresh) ? { tabId: fresh.tabId, windowId: fresh.windowId } : undefined;
    if (this.watched(dwell, this.view) && this.watched(dwell, view)) {
      try { this.acknowledge(dwell.record.observation.id, dwell.attentionId); return; } catch { /* Expired meanwhile: nothing is acknowledged. */ }
    }
    // The fresh answer replaces the cached view: a dwell restarts only from what Chrome reports now.
    this.view = view; this.dwell();
  }
  // After each committed sample. A raised reason is a new attention identity; observed work or idle ends the tab's run. An
  // identity raised again with the same reason, in the same tab and service, with only unknown, failed or expired evidence
  // since the previous one (a throttled background tab whose evidence lapsed) is the same condition again: not notified twice.
  // A notification still in its grace period has already been rebound to it by syncNotices(), in changed().
  private attended(tabId: number, record: ActivityRecord, raised?: WebAttentionReason) {
    const { provider, state } = record.observation;
    if (state === 'working' || state === 'idle') { this.repeats.delete(tabId); return; }
    if (!raised) return;
    const last = this.repeats.get(tabId);
    this.repeats.set(tabId, { provider, reason: raised });
    if (last?.provider !== provider || last.reason !== raised) this.raised(tabId, record);
  }
  // Notifies a new attention identity once, the moment it is raised: for an opted-in service, with Chrome's permission, and
  // not while its tab is the one being viewed. The asynchronous checks are followed by a synchronous re-check of everything.
  private raised(tabId: number, record: ActivityRecord) {
    const { provider, attention } = record.observation;
    if (!attention || !this.notifyProviders.has(provider) || this.notified.has(attention.id)) return;
    const notice: Notice = { id: noticeId(record.observation.id, attention.id), tabId, provider, reason: attention.reason, record, identity: record.identity, attentionId: attention.id, grantId: this.grants.get(provider)!.id };
    const revision = this.noticeRevisions.get(provider), current = () => this.noticeRevisions.get(provider) === revision && this.holds(notice);
    void (async () => {
      if (!await this.access.canNotify().catch(() => false) || !current()) return;
      // The automatic seen source: the active tab of Chrome's focused window, IDs only. A failed query is not a view.
      const view = await this.access.viewing().catch(() => undefined);
      if (current() && !(validView(view) && view.tabId === tabId)) this.show(notice);
    })();
  }
  // A notification stands for one attention identity: same record, unacknowledged and live, same grant, service opted in.
  private holds(notice: Notice) {
    const { record, tabId, provider } = notice, observation = record.observation, grant = this.grants.get(provider)!;
    return this.records.get(tabId) === record && record.identity === notice.identity && observation.state === 'attention' && observation.attention?.id === notice.attentionId
      && !observation.attention.acknowledged && observation.validUntil > this.access.now() && grant.enabled && grant.id === notice.grantId && this.notifyProviders.has(provider);
  }
  // One live notification per tab, replaced by a newer one; NOTICE_LIMIT in all, the oldest cleared first. Chrome calls are
  // serialized so a clear never overtakes the creation it undoes.
  private show(notice: Notice) {
    const session = this.sessions.get(notice.tabId);
    if (session?.provider !== notice.provider) return;
    this.dismiss(notice.tabId);
    while (this.notices.size >= NOTICE_LIMIT) this.dismiss(this.notices.keys().next().value!);
    this.notices.set(notice.tabId, notice); remember(this.notified, notice.attentionId, NOTIFIED_LIMIT);
    const content = activityNotice(notice.provider, notice.reason, session.number, this.language);
    this.noticeQueue = this.noticeQueue.catch(() => undefined).then(() => this.access.showNotification(notice.id, content))
      .catch(() => { if (this.notices.get(notice.tabId) === notice) this.notices.delete(notice.tabId); });
  }
  private dismiss(tabId: number) {
    const notice = this.notices.get(tabId);
    if (notice) { this.notices.delete(tabId); this.clearNotice(notice.id); }
  }
  private clearNotice(id: string) { this.noticeQueue = this.noticeQueue.catch(() => undefined).then(() => this.access.clearNotification(id)).catch(() => undefined); }
  private noticeTab(id: string) { for (const [tabId, notice] of this.notices) if (notice.id === id) return tabId; return undefined; }
  // The tab still belongs to the notification's service, grant and setting.
  private noticeScope(notice: Notice) {
    const grant = this.grants.get(notice.provider)!;
    return grant.enabled && grant.id === notice.grantId && this.notifyProviders.has(notice.provider) && this.sessions.get(notice.tabId)?.provider === notice.provider;
  }
  // Only the evidence lapsed: the tab's record shows no state (expired, even before the watchdog marks it, a failed sample or
  // no recognized signal), not navigation, and the grace period has not ended. Unknown, failed or expired evidence is also
  // what the repeat guard in attended() treats as the same condition, so the notification and the guard agree.
  private lapsing(notice: Notice) {
    const observation = this.records.get(notice.tabId)?.observation, now = this.access.now();
    return Boolean(observation) && (observation!.state === 'unknown' || observation!.validUntil <= now) && observation!.unknownReason !== 'navigation'
      && (notice.lapsedUntil === undefined || now < notice.lapsedUntil) && this.noticeScope(notice);
  }
  // After a lapse, within the grace period: the same reason raised again in that tab, as a new identity, unacknowledged and live.
  private continuation(notice: Notice) {
    const record = this.records.get(notice.tabId), attention = record?.observation.attention, now = this.access.now();
    return record && attention && notice.lapsedUntil !== undefined && now < notice.lapsedUntil && record.observation.state === 'attention' && attention.reason === notice.reason
      && attention.id !== notice.attentionId && !attention.acknowledged && record.observation.validUntil > now && this.noticeScope(notice) ? record : undefined;
  }
  // Acknowledgment (manual, mark all, automatic seen), replacement, navigation, tab closure, revocation and a service leaving
  // the setting all end the attention a notification stands for: it is cleared. Expired, failed or unrecognized evidence only
  // lapses it for NOTICE_GRACE: the same reason raised again in that tab meanwhile rebinds it to that new identity, without
  // another Chrome call; anything else, or the end of the grace period, clears it.
  private syncNotices() {
    const now = this.access.now();
    for (const [tabId, notice] of this.notices) {
      if (this.holds(notice)) continue;
      const record = this.continuation(notice);
      if (record) {
        Object.assign(notice, { record, identity: record.identity, attentionId: record.observation.attention!.id });
        delete notice.lapsedUntil; remember(this.notified, notice.attentionId, NOTIFIED_LIMIT);
      } else if (this.lapsing(notice)) notice.lapsedUntil ??= now + NOTICE_GRACE;
      else this.dismiss(tabId);
    }
    clearTimeout(this.graceTimer);
    const deadlines = [...this.notices.values()].flatMap(notice => notice.lapsedUntil ?? []);
    if (deadlines.length) this.graceTimer = setTimeout(() => this.syncNotices(), Math.max(1, Math.ceil(Math.min(...deadlines) - now) + 1));
  }
  // Resolves once test() holds, checked now and after every change, or after ms at the latest.
  private until(test: () => boolean, ms: number) {
    return new Promise<void>(resolve => {
      const done = () => { clearTimeout(timer); this.waiters.delete(check); resolve(); }, check = () => { if (test()) done(); };
      const timer = setTimeout(done, ms);
      this.waiters.add(check); check();
    });
  }
  // Activity is discarded with each worker life, so notifications a previous life left can no longer follow their
  // attention: they are cleared once and never shown again. Those of this life are kept. Also run when the permission is
  // granted again, for notifications Chrome could not clear while it was removed.
  private clearStaleNotices() {
    void this.access.shownNotifications().catch(() => [] as string[]).then(ids => { for (const id of ids) if (isNoticeId(id) && this.noticeTab(id) === undefined) this.clearNotice(id); });
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
  private changed() { this.paintBadge(); this.access.notify(); this.arm(); this.dwell(); this.syncNotices(); for (const check of [...this.waiters]) check(); }
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
    // Without the tabs permission: only the window's id and focused flag and the tab's id, window and active flag are read.
    viewing: async () => {
      const window = await chrome.windows.getLastFocused();
      if (!window.focused || !validIndex(window.id)) return undefined;
      const [tab] = await chrome.tabs.query({ active: true, windowId: window.id });
      return tab?.active && validIndex(tab.id) && tab.windowId === window.id ? { tabId: tab.id, windowId: window.id } : undefined;
    },
    // Optional OS notifications. chrome.notifications is absent until the optional permission is granted; once it is removed,
    // the object can remain but Chrome refuses its calls, so a clear then rejects.
    canNotify: () => chrome.permissions.contains({ permissions: [NOTIFICATION_PERMISSION] }),
    showNotification: async (id, notice) => { await chrome.notifications.create(id, { type: 'basic', iconUrl: chrome.runtime.getURL('icons/icon128.png'), title: notice.title, message: notice.message, contextMessage: 'Pilovo', priority: 0, requireInteraction: false }); },
    clearNotification: async id => { if (chrome.notifications) await chrome.notifications.clear(id); },
    shownNotifications: async () => chrome.notifications ? Object.keys(await chrome.notifications.getAll()) : [],
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
