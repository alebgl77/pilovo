import { ACTIVITY_HEARTBEAT, ACTIVITY_TTL, monotonicEpoch, type ActivityLease } from '../shared/activity';
import { readEvidence, type EvidenceMemory } from './evidence';

interface Controller { sample(lease: ActivityLease): unknown; dispose(grantId?: string): void }
declare global { var __pilovoObserverV1: Controller | undefined }

// This bundle executes only in an isolated world. Installation itself never inspects the page.
if (!globalThis.__pilovoObserverV1) {
  let activationId = crypto.randomUUID(), sequence = 0, lease: ActivityLease | undefined;
  let lastIssued = -Infinity, lastRead = 0, route = '', suspended = false;
  let evidenceMemory: EvidenceMemory = { worked: false };
  let observer: MutationObserver | undefined, heartbeat: ReturnType<typeof setInterval> | undefined;
  let mutationTimer: ReturnType<typeof setTimeout> | undefined, expiry: ReturnType<typeof setTimeout> | undefined;
  const clear = () => { observer?.disconnect(); observer = undefined; clearInterval(heartbeat); heartbeat = undefined; clearTimeout(mutationTimer); mutationTimer = undefined; clearTimeout(expiry); expiry = undefined; };
  const rotate = () => { clear(); activationId = crypto.randomUUID(); sequence = 0; route = ''; lastRead = 0; evidenceMemory = { worked: false }; };
  const active = () => {
    if (suspended || !lease || monotonicEpoch() >= lease.expiresAt) { clear(); return false; }
    return true;
  };
  const send = (kind: 'boot' | 'change' | 'heartbeat') => {
    if (!active()) return;
    // Checking the route is local-only; no URL ever enters a message.
    if (route && route !== location.href) { rotate(); route = location.href; start(); kind = 'boot'; }
    if (sequence >= Number.MAX_SAFE_INTEGER) { rotate(); start(); kind = 'boot'; }
    void chrome.runtime.sendMessage({ channel: 'pilovo.observe', version: 1, activationId, sequence: ++sequence, kind }).catch(() => undefined);
  };
  const start = () => {
    if (!active() || observer) return;
    observer = new MutationObserver(() => {
      if (!active() || mutationTimer) return;
      mutationTimer = setTimeout(() => { mutationTimer = undefined; if (active()) send('change'); }, 1_000);
    });
    observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-label', 'aria-disabled', 'aria-hidden', 'disabled', 'hidden', 'data-testid', 'contenteditable', 'class', 'style'] });
    heartbeat = setInterval(() => { if (active()) send('heartbeat'); }, ACTIVITY_HEARTBEAT);
  };
  globalThis.__pilovoObserverV1 = {
    sample(next) {
      const now = monotonicEpoch();
      if (!next || !Number.isFinite(next.issuedAt) || !Number.isFinite(next.expiresAt) || next.issuedAt < lastIssued || next.issuedAt > now + 100 || next.expiresAt <= now || next.expiresAt - next.issuedAt !== ACTIVITY_TTL || suspended) return null;
      const changed = !lease || next.workerId !== lease.workerId || next.grantId !== lease.grantId || now >= lease.expiresAt || lastRead && now - lastRead >= ACTIVITY_TTL || route && route !== location.href;
      if (changed) rotate();
      lease = next; lastIssued = next.issuedAt; lastRead = now; route = location.href;
      if (!active()) return null;
      start(); clearTimeout(expiry); expiry = setTimeout(() => { if (!active()) clear(); }, Math.max(0, next.expiresAt - monotonicEpoch()));
      const evidence = readEvidence(document, evidenceMemory);
      return { version: 1, requestId: next.requestId, activationId, evidence };
    },
    dispose(grantId) { if (grantId && lease?.grantId !== grantId) return; rotate(); lease = undefined; },
  };
  const suspend = () => { suspended = true; rotate(); };
  const resume = () => { suspended = false; rotate(); if (active()) { start(); send('boot'); } };
  addEventListener('pagehide', suspend); addEventListener('pageshow', resume);
  document.addEventListener('freeze', suspend); document.addEventListener('resume', resume);
}

export {};
