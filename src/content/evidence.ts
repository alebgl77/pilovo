import type { ActivityEvidence } from '../shared/activity';

// Fixed selectors and exact accessibility tokens only. Never traverse a transcript.
const STOP = new Set(['Stop', 'Stop generating', 'Stop response', 'Arrêter', 'Arrêter la génération', 'Arrêter la réponse']);
const COMPLETE_GPT = new Set(['Response complete', 'Response completed', 'Réponse terminée']);
const COMPLETE_CLAUDE = new Set(['Claude has finished its response.', 'Claude has finished responding.', 'Claude a terminé sa réponse.']);
const ERRORS = new Set(['Something went wrong.', 'Something went wrong', 'Une erreur est survenue.', 'Une erreur est survenue']);
const INPUT = new Set(['Your approval is required.', 'Votre approbation est requise.']);
export function visible(element: Element): boolean {
  if (element.closest('[hidden], [aria-hidden="true"], [inert]')) return false;
  const style = getComputedStyle(element);
  return style.display !== 'none' && style.visibility !== 'hidden' && style.visibility !== 'collapse' && element.getClientRects().length > 0;
}
function token(element: Element | null, whitelist: Set<string>): boolean {
  // Dedicated announcers can be visually hidden for accessibility. Their fixed status text is the only text inspected.
  if (!element || element.closest('[hidden], [aria-hidden="true"], [inert]')) return false;
  const text = element.textContent;
  return text !== null && text.length <= 96 && whitelist.has(text.trim());
}
export interface EvidenceMemory { worked: boolean; completion?: Element | null; completionChild?: ChildNode | null; completionToken?: boolean }
export function readEvidence(doc: Document = document, memory: EvidenceMemory = { worked: false }): ActivityEvidence {
  const host = doc.location.hostname;
  const gpt = host === 'chatgpt.com';
  if (!gpt && host !== 'claude.ai') return 'unknown';
  if (!gpt) {
    const notice = doc.querySelector('[data-cds="ChatComposerNotices"] [role="status"][aria-live="polite"]');
    if (notice && visible(notice)) {
      const value = notice.textContent;
      if (value && value.length <= 512 && ['Vous n’avez plus de crédits d’utilisation.', 'You’re out of usage.'].some(prefix => value.trim().startsWith(prefix))) return 'error_visible';
      // An unfamiliar dedicated composer notice can represent a block. It cannot be treated as completion.
      return 'unknown';
    }
  }
  const composer = doc.querySelector(gpt ? 'form [role="textbox"][contenteditable="true"], form #prompt-textarea[contenteditable="true"]' : '[data-testid="chat-input"][role="textbox"][contenteditable="true"]');
  if (!composer || !visible(composer) || composer.closest('[aria-disabled="true"], [disabled], [data-disabled="true"]')) return 'unknown';
  const scope = composer.closest('form') || composer.closest('[data-testid="chat-input-container"]') || composer.parentElement?.parentElement;
  if (!scope) return 'unknown';
  const announcer = doc.querySelector(gpt ? 'span[role="status"][aria-live="polite"]' : '[data-testid="response-status-announcer"][role="status"]');
  const completed = token(announcer, gpt ? COMPLETE_GPT : COMPLETE_CLAUDE);
  // A disabled send button is deliberately never treated as evidence of generation.
  const buttons = scope.querySelectorAll('button[aria-label], button[data-testid="stop-button"]');
  for (let i = 0; i < Math.min(buttons.length, 40); i++) {
    const button = buttons[i];
    if (visible(button) && !button.hasAttribute('disabled') && button.getAttribute('aria-disabled') !== 'true' && (STOP.has(button.getAttribute('aria-label') || '') || gpt && button.getAttribute('data-testid') === 'stop-button')) {
      memory.worked = true; memory.completion = announcer; memory.completionChild = announcer?.firstChild; memory.completionToken = completed;
      return 'working';
    }
  }
  const error = scope.querySelector('[role="alert"][data-testid="composer-error"], [role="alert"][data-testid="chat-input-error"]');
  if (error && visible(error) && token(error, ERRORS)) return 'error_visible';
  const input = scope.querySelector('[role="alert"][data-testid="approval-required"]');
  if (input && visible(input) && token(input, INPUT)) return 'input_required';
  if (memory.worked) {
    // A previous answer's unchanged completion marker never completes a newer generation.
    if (!completed || memory.completionToken && memory.completion === announcer && memory.completionChild === announcer?.firstChild) return 'unknown';
    return 'idle_ready';
  }
  if (completed) return 'idle_ready';
  // A recognized usable composer is idle only when its provider-specific ready control is visible.
  if (gpt) {
    for (let i = 0; i < Math.min(buttons.length, 40); i++) if (visible(buttons[i]) && ['Start voice mode', 'Start voice conversation', 'Démarrer une conversation vocale'].includes(buttons[i].getAttribute('aria-label') || '')) return 'idle_ready';
  } else {
    const send = scope.querySelector('[data-testid="chat-input-send"]');
    if (send && visible(send)) return 'idle_ready';
  }
  return 'unknown';
}
