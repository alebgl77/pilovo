import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AlertCircle, ArrowRight, Check, Code2, Inbox, Link2, LockKeyhole, TerminalSquare, X } from 'lucide-react';
import type { Connection, Execution, TaskRun } from '../shared/types';
import { sourceName } from './model';
import type { MessageKey, Translate } from './i18n';

export type ActionRunner = (action: () => Promise<unknown>, success?: MessageKey) => Promise<boolean>;
export interface DialogRequest {
  title: string; description?: string; kind: 'mission' | 'confirm' | 'deleteMission'; initialValue?: string;
  submitLabel: string; danger?: boolean; onSubmit: (value: string, deleteTasks: boolean) => Promise<unknown>; success?: MessageKey;
}
export function SourceIcon({ source, size = 20 }: { source: TaskRun['sourceId']; size?: number }) {
  const Icon = source === 'claude-code' ? TerminalSquare : Code2;
  return <span className={`source-icon ${source}`} aria-hidden="true"><Icon size={size} strokeWidth={1.7} /></span>;
}
export function SourceLabel({ source }: { source: TaskRun['sourceId'] }) { return <span className="source-label"><SourceIcon source={source} size={16} />{sourceName(source)}</span>; }
export function Status({ value, t }: { value: Execution | Connection | 'pending' | 'accepted' | 'rejected' | 'unverified' | 'verified' | 'failed_review'; t: Translate }) {
  return <span className={`status status-${value}`}><span className="status-dot" aria-hidden="true" />{t(value)}</span>;
}
export function EmptyState({ title, text, action, compact = false }: { title: string; text: string; action?: ReactNode; compact?: boolean }) {
  return <div className={`empty-state${compact ? ' compact' : ''}`}><div className="empty-glyph"><Inbox size={26} strokeWidth={1.35} aria-hidden="true" /></div><h2>{title}</h2><p>{text}</p>{action && <div className="empty-actions">{action}</div>}</div>;
}
export function Notice({ children, warning = false }: { children: ReactNode; warning?: boolean }) {
  return <div className={`notice${warning ? ' warning' : ''}`}><AlertCircle size={16} aria-hidden="true" /><div>{children}</div></div>;
}
export function FirstSteps({ t, connect }: { t: Translate; connect: () => void }) {
  return <aside className="first-steps"><div className="welcome-mark" aria-hidden="true"><Link2 size={26} strokeWidth={1.4} /></div><h2>{t('startTitle')}</h2><p className="lead">{t('startText')}</p><ol className="steps">{(['step1', 'step2', 'step3'] as const).map((key, i) => <li key={key}><span className="step-number">{i + 1}</span><div><h3>{t(key)}</h3><p>{t(`${key}Text`)}</p></div></li>)}</ol><button className="button primary" onClick={connect}>{t('connectAgents')}<ArrowRight size={16} /></button><div className="local-note"><LockKeyhole size={17} aria-hidden="true" /><div><strong>{t('localOnly')}</strong><p>{t('localOnlyText')}</p></div></div></aside>;
}
export function ActionDialog({ request, dismiss, run, busy, t, error }: { request: DialogRequest; dismiss: () => void; run: ActionRunner; busy: boolean; t: Translate; error?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [value, setValue] = useState(request.initialValue || '');
  const [deleteTasks, setDeleteTasks] = useState(false);
  const [invalid, setInvalid] = useState(false);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = ref.current;
    dialog?.showModal();
    return () => { dialog?.close(); if (previous?.isConnected) previous.focus(); };
  }, []);
  return <dialog ref={ref} className="action-dialog" aria-labelledby="dialog-title" aria-describedby={request.description ? 'dialog-description' : undefined} onCancel={event => { event.preventDefault(); if (!busy) dismiss(); }}>
    <form onSubmit={async event => { event.preventDefault(); if (request.kind === 'mission' && !value.trim()) { setInvalid(true); return; } const success = await run(() => request.onSubmit(value.trim(), deleteTasks), request.success); if (success) dismiss(); }}>
      <div className="dialog-heading"><h2 id="dialog-title">{request.title}</h2><button type="button" className="icon-button" aria-label={t('close')} disabled={busy} onClick={dismiss}><X size={18} /></button></div>
      {request.description && <p id="dialog-description">{request.description}</p>}
      {request.kind === 'mission' && <label className="field-label">{t('name')}<input autoFocus value={value} maxLength={120} onChange={event => { setValue(event.target.value); setInvalid(false); }} placeholder={t('missionPlaceholder')} aria-invalid={invalid} aria-describedby={invalid ? 'name-error' : undefined} required />{invalid && <span className="field-error" id="name-error">{t('missionNameRequired')}</span>}</label>}
      {request.kind === 'deleteMission' && <label className="checkbox-label"><input type="checkbox" checked={deleteTasks} onChange={event => setDeleteTasks(event.target.checked)} />{t('deleteMissionTasks')}</label>}
      {error && <p className="field-error dialog-error" role="alert">{error}</p>}
      <div className="dialog-actions"><button type="button" className="button" onClick={dismiss} disabled={busy}>{t('cancel')}</button><button type="submit" className={`button ${request.danger ? 'danger' : 'primary'}`} disabled={busy}>{busy ? t('saving') : request.submitLabel}</button></div>
    </form>
  </dialog>;
}
export function CheckLabel({ children }: { children: ReactNode }) { return <span className="check-label"><Check size={15} aria-hidden="true" />{children}</span>; }
