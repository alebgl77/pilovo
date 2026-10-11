import { chromium, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, writeFile, copyFile } from 'node:fs/promises';
import path from 'node:path';
const base = process.env.HUB_TEST_URL || 'http://127.0.0.1:5173';
const output = path.resolve('tests/ui/results'), captures = path.resolve('outputs'), media = path.resolve('docs/media/screenshots');
await Promise.all([output, captures, media].map(directory => mkdir(directory, { recursive: true })));
const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
const context = await browser.newContext({ viewport: { width: 1365, height: 1050 }, colorScheme: 'light' });
const page = await context.newPage();
const report = { scope: 'Synthetic activity fixture; no real conversations or provider evidence.', checks: [], accessibility: [], errors: [] };
page.on('pageerror', error => report.errors.push(error.message));
const pass = name => { report.checks.push(name); process.stdout.write(`PASS ${name}\n`); };
const row = id => page.locator(`[data-activity-id="${id}"]`);
const audit = async name => { await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))); await page.evaluate(() => Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => {})))); const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze(); report.accessibility.push({ name, violations: result.violations.map(({ id, impact, nodes }) => ({ id, impact, targets: nodes.map(node => node.target) })) }); expect(result.violations).toEqual([]); };
const overflow = async () => expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && [...document.querySelectorAll('.page-scroll')].every(element => element.scrollWidth <= element.clientWidth + 1))).toBe(true);
const elapsed = id => row(id).locator('.activity-elapsed');
const heading = id => row(id).locator('h3'), place = id => row(id).locator('.activity-place');
const renameButton = (id, name = 'Nommer cette session') => row(id).getByRole('button', { name, exact: true });
const nameField = (id, name = /^Nom de /) => row(id).getByRole('textbox', { name });
// The rename target, or the open field with its focus ring, never overlaps the row's state line or its position line.
const clearLines = (target, id) => target.locator(`[data-activity-id="${id}"]`).evaluate(row => {
  const control = row.querySelector('.activity-rename-form input') || row.querySelector('.activity-rename'), style = getComputedStyle(control);
  const ring = control.matches(':focus-visible') && style.outlineStyle !== 'none' ? Math.max(0, parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset)) : 0;
  const box = control.getBoundingClientRect(), lines = [...row.querySelectorAll('.activity-state, .activity-place')];
  return lines.length > 0 && lines.every(line => { const other = line.getBoundingClientRect(); return box.bottom + ring <= other.top || box.top - ring >= other.bottom || box.right + ring <= other.left || box.left - ring >= other.right; });
});
const labelCalls = () => page.evaluate(() => window.__activity.calls().label);
const minuteTicker = () => page.evaluate(() => window.__activity.timers().filter(delay => delay <= 15_000));
// Elapsed durations are plain row text: never in a live region, and each fits its row without clipping or overflow.
const quietDurations = async () => expect(await page.evaluate(() => [...document.querySelectorAll('.activity-elapsed')].map(element => !element.closest('[aria-live], [role="status"], [role="alert"], [role="log"], [role="timer"]') && element.scrollWidth <= element.clientWidth + 1 && element.getBoundingClientRect().right <= innerWidth))).toEqual(expect.not.arrayContaining([false]));
const screenshot = async name => { await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); document.querySelector('.activity-page')?.scrollTo(0, 0); }); const file = `Pilovo_${name}_synthetic.png`; await page.screenshot({ path: path.join(captures, file), fullPage: true }); await copyFile(path.join(captures, file), path.join(media, file)); };
try {
  await page.goto(`${base}/tests/ui/activity-harness.html?loading`);
  await expect(page.getByRole('status')).toContainText('Recherche des sessions');
  await page.evaluate(() => { window.__activity.hold(false); window.__activity.signal(); });
  await expect(page.getByRole('heading', { name: 'Activité', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Connectez votre premier service' })).toBeVisible();
  await expect(page.getByText('puis ouvrez un onglet existant', { exact: false })).toBeVisible();
  await page.evaluate(() => window.__activity.deny(true));
  await page.getByRole('button', { name: 'Connecter Claude', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('permission n’a pas été accordée');
  await expect(page.getByRole('button', { name: 'Connecter ChatGPT', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Ouvrir Claude', exact: true }).click();
  expect(await page.evaluate(() => window.__activity.calls().opens)).toEqual(['claude-web']);
  await page.evaluate(() => window.__activity.deny(false));
  await page.getByRole('button', { name: 'Connecter Claude', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Déconnecter Claude', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Connecter ChatGPT', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Aucune session observée pour l’instant' })).toBeVisible();
  expect((await page.evaluate(() => window.__activity.calls().permission)).every(call => call.provider === 'claude-web')).toBe(true);
  await audit('activity-first-use');
  pass('loading, honest first use, denied permission, independent provider grants and fixed provider open');

  await page.evaluate(() => window.__activity.seed());
  await expect(page.locator('.activity-row')).toHaveCount(4);
  await expect(page.locator('.activity-row').first()).toHaveAttribute('data-activity-id', 'attention');
  await expect(page.locator('.activity-row').nth(1)).toHaveAttribute('data-activity-id', 'working');
  await expect(row('attention')).toContainText('Réponse disponible');
  await expect(row('idle')).toContainText('En attente');
  await expect(row('unsupported')).toContainText('signal d’activité reconnu');
  await expect(row('unsupported').getByRole('button', { name: 'Ouvrir la session' })).toBeDisabled();
  await expect(elapsed('working')).toHaveText('En cours depuis 4 min');
  await expect(elapsed('attention')).toHaveText('Réponse disponible depuis 2 min');
  await expect(elapsed('idle')).toHaveCount(0); await expect(elapsed('unsupported')).toHaveCount(0);
  await quietDurations();
  await expect(page.locator('.activity-semantics')).toContainText('votre tâche peut encore demander du travail');
  await expect(page.getByRole('button', { name: /^(Arrêter|Pause|Terminer)$/ })).toHaveCount(0);
  await audit('activity-desktop-light'); await overflow(); await screenshot('activity_desktop');
  await page.evaluate(() => window.__activity.failFocus(true));
  await row('attention').getByRole('button', { name: 'Ouvrir la session' }).click();
  await expect(row('attention').getByRole('alert')).toContainText('n’a pas pu être ouverte');
  expect(await page.evaluate(() => window.__activity.calls().focus)).toEqual(['attention']);
  expect(await page.evaluate(() => window.__activity.calls().ack)).toEqual([]);
  await expect(row('attention').getByRole('button', { name: 'Marquer comme vu' })).toBeVisible();
  await page.evaluate(() => { window.__activity.failFocus(false); window.__activity.failAck(true); });
  await row('attention').getByRole('button', { name: 'Marquer comme vu' }).click();
  await expect(row('attention').getByRole('alert')).toContainText('n’a pas pu être marqué');
  await page.evaluate(() => window.__activity.failAck(false));
  await row('attention').getByRole('button', { name: 'Marquer comme vu' }).click();
  await expect(row('attention').locator('.activity-state')).toHaveText('Vu');
  await expect(row('attention')).toContainText('Réponse disponible');
  await expect(elapsed('attention')).toHaveText('Réponse disponible depuis 2 min');
  await expect(page.locator('.activity-summary dd').first()).toHaveText('0');
  await expect(row('attention').getByRole('button', { name: 'Ouvrir la session' })).toBeFocused();
  pass('attention ordering, unsupported state, response-ready semantics, elapsed durations for working and attention (seen or not) only, ID-bound focus failure and confirmed event acknowledgement');

  await page.evaluate(() => { window.__activity.seed(); window.__activity.holdAck(true); });
  await row('attention').getByRole('button', { name: 'Marquer comme vu' }).click();
  await expect(row('attention').getByRole('button', { name: 'Enregistrement…' })).toBeDisabled();
  const beforeAck = await page.evaluate(() => window.__activity.calls().ack.length);
  await row('attention').getByRole('button', { name: 'Enregistrement…' }).evaluate(button => button.click());
  expect(await page.evaluate(() => window.__activity.calls().ack.length)).toBe(beforeAck);
  await page.evaluate(() => window.__activity.nextAttention());
  await expect(row('attention')).toContainText('Une intervention est demandée');
  await expect(elapsed('attention')).toHaveText('Intervention demandée depuis moins d’une minute');
  await page.evaluate(() => { window.__activity.holdAck(false); window.__activity.resolveAck(); });
  await expect(row('attention').getByRole('button', { name: 'Marquer comme vu' })).toBeEnabled();
  await expect(row('attention').locator('.activity-state')).toHaveText('À vérifier');
  await expect(row('attention').getByRole('alert')).toHaveCount(0);
  expect((await page.evaluate(() => window.__activity.calls().ack)).at(-1).attentionId).toBe('event-a');
  pass('duplicate action lock and old acknowledgement cannot acknowledge a newer attention event');

  await page.evaluate(() => window.__activity.seed());
  // Worker-assigned numbers per provider and Chrome positions (1-based); never tab titles or URLs.
  await expect(heading('attention')).toHaveText('ChatGPT · session 2'); await expect(heading('working')).toHaveText('ChatGPT · session 1');
  await expect(heading('idle')).toHaveText('Claude · session 1'); await expect(heading('unsupported')).toHaveText('Claude · session 2');
  await expect(place('working')).toHaveText('Onglet 4'); await expect(place('idle')).toHaveText('Onglet 2');
  await expect(place('attention')).toHaveText('Onglet 1 · autre fenêtre'); await expect(place('unsupported')).toHaveCount(0);
  await page.evaluate(() => window.__activity.close('idle'));
  await expect(row('idle')).toHaveCount(0); await expect(heading('unsupported')).toHaveText('Claude · session 2');
  await page.evaluate(() => window.__activity.move('attention', 2, 1));
  await expect(place('attention')).toHaveText('Onglet 3'); await expect(heading('attention')).toHaveText('ChatGPT · session 2');
  await page.evaluate(() => window.__activity.panelWindow(2));
  await expect(place('attention')).toHaveText('Onglet 3 · autre fenêtre'); await expect(place('working')).toHaveText('Onglet 4 · autre fenêtre');
  await page.evaluate(() => { window.__activity.panelWindow(1); window.__activity.seed(); });
  await expect(place('attention')).toHaveText('Onglet 1 · autre fenêtre');
  pass('rows show the worker session number and the tab position, with another window named; closing another tab never renumbers');

  // Keyboard: Tab reaches the rename button, Enter opens the field, Enter applies the name and returns focus to the button.
  await row('attention').getByRole('button', { name: 'Marquer comme vu' }).focus();
  await page.keyboard.press('Tab'); await expect(renameButton('working')).toBeFocused();
  await page.keyboard.press('Tab'); await expect(row('working').getByRole('button', { name: 'Ouvrir la session' })).toBeFocused();
  await page.keyboard.press('Shift+Tab'); await expect(renameButton('working')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(nameField('working')).toBeFocused(); await expect(nameField('working')).toHaveValue('');
  // The field says which session it renames, and the row keeps its heading for screen readers while it is open.
  await expect(nameField('working')).toHaveAccessibleName('Nom de ChatGPT · session 1 (40 caractères au plus, vide pour l’effacer)');
  await expect(row('working').getByRole('heading', { level: 3 })).toHaveText('ChatGPT · session 1');
  await page.keyboard.type('Revue contrat'); await page.keyboard.press('Enter');
  // A named row keeps its session number, the only link to its OS notifications.
  await expect(heading('working')).toHaveText('Revue contrat — ChatGPT · session 1'); await expect(row('working').locator('h3 .activity-provider')).toHaveText('— ChatGPT · session 1');
  await expect(renameButton('working')).toBeFocused();
  expect((await labelCalls()).at(-1)).toEqual({ id: 'working', label: 'Revue contrat' });
  // Escape cancels the change and restores focus to the button.
  await page.keyboard.press('Space');
  await expect(nameField('working')).toHaveValue('Revue contrat'); await expect(row('working').getByRole('heading', { level: 3 })).toHaveText('Revue contrat — ChatGPT · session 1');
  await expect(nameField('working')).toHaveAccessibleName(/^Nom de ChatGPT · session 1 /);
  await page.keyboard.type('Autre nom'); await page.keyboard.press('Escape');
  await expect(heading('working')).toHaveText('Revue contrat — ChatGPT · session 1'); await expect(renameButton('working')).toBeFocused();
  expect(await labelCalls()).toHaveLength(1);
  await expect(page.locator('.activity-row')).toHaveCount(4);
  // Leaving the field applies the name; focus stays where the user moved it.
  await renameButton('idle').click(); await page.keyboard.type('Brouillon'); await page.keyboard.press('Tab');
  await expect(heading('idle')).toHaveText('Brouillon — Claude · session 1');
  await expect(row('idle').getByRole('button', { name: 'Ouvrir la session' })).toBeFocused();
  // 40 characters at most; a long name wraps inside its row.
  await renameButton('attention').click(); await page.keyboard.type('x'.repeat(45));
  expect(await nameField('attention').inputValue()).toBe('x'.repeat(40)); await page.keyboard.press('Enter');
  await expect(heading('attention')).toHaveText(`${'x'.repeat(40)} — ChatGPT · session 2`); await overflow();
  // An empty name clears the label.
  await renameButton('idle').focus(); await page.keyboard.press('Enter'); await page.keyboard.press('Backspace'); await page.keyboard.press('Enter');
  await expect(heading('idle')).toHaveText('Claude · session 1'); expect((await labelCalls()).at(-1)).toEqual({ id: 'idle', label: null });
  // Bidi override and control characters are refused before sending; the field stays open to correct the text.
  const sent = (await labelCalls()).length;
  await page.keyboard.press('Enter'); await page.keyboard.insertText('Revue\u202Econtrat'); await page.keyboard.press('Enter');
  await expect(row('idle').getByRole('alert')).toContainText('ne peut pas être utilisé');
  await expect(nameField('idle')).toBeFocused(); await expect(nameField('idle')).toHaveAttribute('aria-invalid', 'true');
  await audit('activity-rename-invalid-French');
  // Leaving the field with refused text neither sends nor discards it: the field and its message stay until corrected.
  await page.keyboard.press('Tab'); await expect(row('idle').getByRole('button', { name: 'Ouvrir la session' })).toBeFocused();
  await expect(nameField('idle')).toHaveAttribute('aria-invalid', 'true'); await expect(row('idle').getByRole('alert')).toContainText('ne peut pas être utilisé');
  expect(await nameField('idle').inputValue()).toBe(['Revue', 'contrat'].join(String.fromCodePoint(0x202E)));
  await nameField('idle').focus();
  await page.keyboard.press('Escape'); await expect(row('idle').getByRole('alert')).toHaveCount(0); await expect(renameButton('idle')).toBeFocused();
  expect(await labelCalls()).toHaveLength(sent);
  // A refused save is announced in the row and keeps the previous heading.
  await page.evaluate(() => window.__activity.failLabel(true));
  // A live row without a recognized signal can still be named.
  await renameButton('unsupported').focus(); await page.keyboard.press('Enter'); await page.keyboard.type('Plus tard'); await page.keyboard.press('Enter');
  await expect(row('unsupported').getByRole('alert')).toContainText('n’a pas pu être appliqué');
  await expect(heading('unsupported')).toHaveText('Claude · session 2'); await expect(renameButton('unsupported')).toBeFocused();
  // The message is about that observation and that name: a navigation in the tab, or a new name, clears it.
  await renameButton('idle').focus(); await page.keyboard.press('Enter'); await page.keyboard.type('Refusé'); await page.keyboard.press('Enter');
  await expect(row('idle').getByRole('alert')).toContainText('n’a pas pu être appliqué');
  await page.evaluate(() => window.__activity.failLabel(false));
  await page.getByRole('button', { name: 'Actualiser l’activité' }).click();
  await expect(row('unsupported').getByRole('alert')).toContainText('n’a pas pu être appliqué');
  await page.evaluate(() => window.__activity.navigate('unsupported', 'unsupported-next'));
  await expect(row('unsupported-next')).toHaveCount(1); await expect(row('unsupported-next').getByRole('alert')).toHaveCount(0);
  await page.evaluate(() => window.__activity.rename('idle', 'Ailleurs'));
  await expect(heading('idle')).toHaveText('Ailleurs — Claude · session 1'); await expect(row('idle').getByRole('alert')).toHaveCount(0);
  await page.evaluate(() => window.__activity.rename('idle', null));
  // Labels are rendered as text, never markup.
  await page.evaluate(() => window.__activity.rename('unsupported-next', '<img src=x onerror=alert(1)>'));
  await expect(heading('unsupported-next')).toHaveText('<img src=x onerror=alert(1)> — Claude · session 2'); await expect(row('unsupported-next').locator('h3 img')).toHaveCount(0);
  pass('rename by keyboard: Enter applies, Escape cancels, leaving the field applies, empty clears, 40-character limit, refused characters keep the field open on Enter or leaving it, failures announced and cleared by a new observation or name, text-only rendering');

  // Polling and a navigation in the same tab keep the open field, its text and focus; the save names the tab's current observation.
  await renameButton('working').focus(); await page.keyboard.press('Enter'); await page.keyboard.type('Partiel');
  const readsBeforeEdit = await page.evaluate(() => window.__activity.calls().reads);
  await expect.poll(() => page.evaluate(() => window.__activity.calls().reads), { timeout: 5000 }).toBeGreaterThan(readsBeforeEdit);
  await expect(nameField('working')).toBeFocused(); await expect(nameField('working')).toHaveValue('Partiel');
  await page.evaluate(() => window.__activity.navigate('working', 'working-next'));
  await expect(row('working-next')).toHaveCount(1);
  await expect(nameField('working-next')).toBeFocused(); await expect(nameField('working-next')).toHaveValue('Partiel');
  await audit('activity-rename-open-French');
  await page.keyboard.press('Enter');
  await expect(heading('working-next')).toHaveText('Partiel — ChatGPT · session 1'); await expect(renameButton('working-next')).toBeFocused();
  expect((await labelCalls()).at(-1)).toEqual({ id: 'working-next', label: 'Partiel' });
  await audit('activity-session-identity-French');
  // Rows follow their tab, so a row error must not outlive its observation: a navigation clears it.
  await page.evaluate(() => window.__activity.failFocus(true));
  await row('attention').getByRole('button', { name: 'Ouvrir la session' }).click();
  await expect(row('attention').getByRole('alert')).toContainText('n’a pas pu être ouverte');
  await page.evaluate(() => { window.__activity.failFocus(false); window.__activity.navigate('attention', 'attention-next'); });
  await expect(row('attention-next')).toHaveCount(1); await expect(row('attention-next').getByRole('alert')).toHaveCount(0);
  pass('polling and same-tab navigation preserve an open rename field and focus; save targets the current observation; navigation clears row errors');

  // Only a live observation can be named, as for focus and seen. A lapsed row keeps a focusable but inert rename button.
  await page.evaluate(() => window.__activity.seed());
  await renameButton('idle').focus(); await page.evaluate(() => window.__activity.expire('idle'));
  await expect(row('idle').locator('.activity-state')).toHaveText('Observation interrompue');
  await expect(renameButton('idle')).toHaveAttribute('aria-disabled', 'true'); await expect(renameButton('idle')).toBeFocused();
  const beforeLapsed = (await labelCalls()).length;
  await page.keyboard.press('Enter'); await renameButton('idle').evaluate(button => button.click());
  await expect(row('idle').getByRole('textbox')).toHaveCount(0); await expect(renameButton('idle')).toBeFocused();
  await audit('activity-rename-lapsed-French');
  // A field still open when its row lapses: the worker refuses the name, the row says so, and focus returns to the button.
  await renameButton('unsupported').focus(); await page.keyboard.press('Enter'); await page.keyboard.type('Trop tard');
  await page.evaluate(() => window.__activity.expire('unsupported'));
  await expect(renameButton('idle')).toHaveAttribute('aria-disabled', 'true'); await expect(row('unsupported').locator('.activity-state')).toHaveText('Observation interrompue');
  await expect(nameField('unsupported')).toBeFocused(); await page.keyboard.press('Enter');
  await expect(row('unsupported').getByRole('alert')).toContainText('n’a pas pu être appliqué'); await expect(renameButton('unsupported')).toBeFocused();
  await expect(renameButton('unsupported')).toHaveAttribute('aria-disabled', 'true'); await expect(heading('unsupported')).toHaveText('Claude · session 2');
  expect((await labelCalls()).slice(beforeLapsed)).toEqual([{ id: 'unsupported', label: 'Trop tard' }]);
  // Fresh evidence makes the row nameable again.
  await page.evaluate(() => window.__activity.seed());
  await expect(renameButton('idle')).not.toHaveAttribute('aria-disabled', 'true');
  pass('lapsed rows cannot be named: the rename button stays focusable but inert, and a late save is refused and announced');

  await page.evaluate(() => { window.__activity.seed(); window.__activity.addAttention(); });
  await expect(page.locator('.activity-summary dd').first()).toHaveText('2');
  await expect(page.locator('.activity-row').nth(0)).toHaveAttribute('data-activity-id', 'attention');
  await expect(page.locator('.activity-row').nth(1)).toHaveAttribute('data-activity-id', 'attention-2');
  const markAll = page.getByRole('button', { name: 'Tout marquer comme vu', exact: true });
  await expect(markAll).toBeEnabled();
  await expect(page.locator('.activity-shortcut')).toHaveText('Prochain élément à vérifier : Alt+Maj+J');
  await audit('activity-mark-all-French');
  await page.evaluate(() => window.__activity.failAckAll(true));
  await markAll.click();
  await expect(page.locator('.activity-bulk-error')).toHaveAttribute('role', 'alert');
  await expect(page.locator('.activity-bulk-error')).toContainText('n’ont pas pu être marqués comme vus');
  await expect(row('attention').locator('.activity-state')).toHaveText('À vérifier'); await expect(row('attention-2').locator('.activity-state')).toHaveText('À vérifier');
  expect((await page.evaluate(() => window.__activity.calls().ackAll)).at(-1)).toEqual(['event-a', 'event-c']);
  await page.evaluate(() => window.__activity.failAckAll(false));
  await page.getByRole('button', { name: 'Actualiser l’activité' }).focus();
  await page.keyboard.press('Tab');
  await expect(markAll).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(row('attention').locator('.activity-state')).toHaveText('Vu'); await expect(row('attention-2').locator('.activity-state')).toHaveText('Vu');
  await expect(row('attention')).toContainText('Réponse disponible');
  await expect(page.locator('.activity-summary dd').first()).toHaveText('0');
  await expect(markAll).toHaveCount(0); await expect(page.locator('.activity-bulk-error')).toHaveCount(0);
  await expect(page.locator('.activity-row').first().getByRole('button', { name: 'Ouvrir la session' })).toBeFocused();
  // Only the two refused opens of the earlier checks: marking all as seen never opens a session.
  expect(await page.evaluate(() => window.__activity.calls().focus)).toEqual(['attention', 'attention']);
  pass('mark all as seen: shown for two items to review, keyboard operable, failure announced and confirmed only by a refreshed snapshot');

  await page.evaluate(() => { window.__activity.seed(); window.__activity.addAttention(); window.__activity.holdAckAll(true); });
  await markAll.click();
  await expect(page.locator('.activity-bulk .button')).toHaveText('Enregistrement…');
  await expect(page.locator('.activity-bulk .button')).toBeDisabled();
  const beforeAll = await page.evaluate(() => window.__activity.calls().ackAll.length);
  await page.locator('.activity-bulk .button').evaluate(button => button.click());
  expect(await page.evaluate(() => window.__activity.calls().ackAll.length)).toBe(beforeAll);
  await page.evaluate(() => window.__activity.nextAttention());
  await expect(row('attention')).toContainText('Une intervention est demandée');
  await page.evaluate(() => { window.__activity.holdAckAll(false); window.__activity.resolveAckAll(); });
  await expect(row('attention-2').locator('.activity-state')).toHaveText('Vu');
  await expect(row('attention').locator('.activity-state')).toHaveText('À vérifier');
  await expect(page.locator('.activity-summary dd').first()).toHaveText('1');
  await expect(markAll).toHaveCount(0); await expect(page.locator('.activity-bulk-error')).toHaveCount(0);
  pass('mark all is locked while pending and cannot acknowledge an attention raised after it was shown');

  await page.evaluate(() => window.__activity.shortcut(null));
  await expect(page.locator('.activity-shortcut')).toHaveCount(0);
  await page.evaluate(() => window.__activity.shortcut('Ctrl+Shift+Y'));
  await expect(page.locator('.activity-shortcut')).toHaveText('Prochain élément à vérifier : Ctrl+Maj+Y');
  await expect(page.locator('.activity-shortcut kbd')).toHaveText('Ctrl+Maj+Y');
  await page.evaluate(() => window.__activity.shortcut('Alt+Shift+J'));
  await expect(page.locator('.activity-shortcut')).toHaveText('Prochain élément à vérifier : Alt+Maj+J');
  // A failed read must not leave the previously read key on screen.
  await page.evaluate(() => window.__activity.failShortcuts(true));
  await expect(page.locator('.activity-shortcut')).toHaveCount(0);
  await page.evaluate(() => window.__activity.failShortcuts(false));
  await expect(page.locator('.activity-shortcut')).toHaveText('Prochain élément à vérifier : Alt+Maj+J');
  pass('shortcut hint shows the configured key and hides when it is unassigned or cannot be read');

  await page.evaluate(() => { window.__activity.hold(true); window.__activity.seed(); });
  const first = await page.evaluate(() => window.__activity.pending() - 1);
  await page.evaluate(() => window.__activity.empty());
  const last = await page.evaluate(() => window.__activity.pending() - 1);
  expect(last).toBeGreaterThan(first);
  await page.evaluate(index => window.__activity.resolve(index), last);
  await expect(page.locator('.activity-row')).toHaveCount(0);
  await page.evaluate(index => window.__activity.resolve(index), first);
  await expect(page.locator('.activity-row')).toHaveCount(0);
  await page.evaluate(() => { window.__activity.hold(false); window.__activity.seed(); });
  await expect(page.locator('.activity-row')).toHaveCount(4);
  await page.evaluate(() => window.__activity.fail(true));
  await expect(page.getByRole('alert')).toContainText('ne sont plus confirmées');
  await expect(page.locator('.activity-summary dd').first()).toHaveText('0');
  await expect(row('attention').locator('.activity-state')).toHaveText('Observation interrompue');
  await expect(page.locator('.activity-elapsed')).toHaveCount(0);
  expect(await page.locator('body').innerText()).not.toContain('private transport diagnostic');
  await page.evaluate(() => window.__activity.fail(false));
  await expect(row('attention').locator('.activity-state')).toHaveText('À vérifier');
  // A panel-only interruption hides durations; the worker's continuous observation brings them back unchanged.
  await expect(elapsed('attention')).toHaveText('Réponse disponible depuis 2 min'); await expect(elapsed('working')).toHaveText('En cours depuis 4 min');
  pass('latest request wins; failed reads downgrade all old data, hide durations until confirmed again and never expose raw diagnostics');

  await page.evaluate(() => window.__activity.seed(700));
  await expect(row('attention').locator('.activity-state')).toHaveText('À vérifier');
  await page.evaluate(() => window.__activity.hold(true));
  await expect(row('attention').locator('.activity-state')).toHaveText('Observation interrompue', { timeout: 4000 });
  await expect(row('attention')).toContainText('a expiré');
  await expect(row('attention').getByRole('button', { name: 'Ouvrir la session' })).toBeDisabled();
  await expect(row('attention').getByRole('button', { name: 'Marquer comme vu' })).toHaveCount(0);
  await expect(page.locator('.activity-summary dd').first()).toHaveText('0');
  await expect(page.locator('.activity-elapsed')).toHaveCount(0);
  pass('local monotonic expiry removes live attention, its duration and actions even with a hung worker');

  await page.evaluate(() => { window.__activity.hold(false); window.__activity.seed(); window.__activity.since('working', 57_000); });
  await expect(elapsed('working')).toHaveText('En cours depuis moins d’une minute');
  const workingOpen = row('working').getByRole('button', { name: 'Ouvrir la session' });
  await workingOpen.focus();
  // A hidden page skips every read, so only the panel's local minute ticker can re-render the duration.
  const frozen = await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); return { reads: window.__activity.calls().reads, text: document.querySelector('[data-activity-id="working"] .activity-elapsed')?.textContent }; });
  expect(frozen.text).toBe('En cours depuis moins d’une minute');
  await expect(elapsed('working')).toHaveText('En cours depuis 1 min', { timeout: 6000 });
  expect(await page.evaluate(() => window.__activity.calls().reads)).toBe(frozen.reads);
  await expect(workingOpen).toBeFocused();
  await page.evaluate(() => { delete document.visibilityState; document.dispatchEvent(new Event('visibilitychange')); window.__activity.since('working', -5_000); });
  await expect(elapsed('working')).toHaveCount(0);
  await expect(row('working')).toContainText('Une réponse est en cours de génération');
  await page.evaluate(() => window.__activity.since('working', 61 * 60_000));
  await expect(elapsed('working')).toHaveText('En cours depuis 1 h 01');
  // The minute ticker (at most 15 s) is armed only while a row shows a duration; the 60 s expiry timer is separate and stays.
  await expect.poll(minuteTicker).not.toEqual([]);
  await page.evaluate(() => window.__activity.settle());
  await expect(row('working')).toContainText('En attente'); await expect(page.locator('.activity-row')).toHaveCount(4);
  await expect(page.locator('.activity-elapsed')).toHaveCount(0);
  await expect.poll(minuteTicker).toEqual([]);
  expect((await page.evaluate(() => window.__activity.timers())).some(delay => delay > 15_000)).toBe(true);
  pass('elapsed duration advances at the minute boundary by a local ticker without any read, keeps keyboard focus; a future start shows nothing; no ticker without a shown duration');

  await page.evaluate(() => { window.__activity.hold(false); window.__activity.seed(); });
  await expect(row('attention').locator('.activity-state')).toHaveText('À vérifier');
  const focus = row('working').getByRole('button', { name: 'Ouvrir la session' });
  await focus.focus();
  const readsBefore = await page.evaluate(() => window.__activity.calls().reads);
  await expect.poll(() => page.evaluate(() => window.__activity.calls().reads), { timeout: 5000 }).toBeGreaterThan(readsBefore);
  await expect(focus).toBeFocused();
  await page.getByRole('button', { name: 'Déconnecter Claude', exact: true }).click();
  await expect(row('idle')).toHaveCount(0); await expect(row('working')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Déconnecter ChatGPT', exact: true })).toBeVisible();
  pass('visible polling preserves keyboard focus; disconnect clears only the chosen provider');

  await page.evaluate(() => { window.__activity.seed(); window.__activity.settings({ language: 'en', theme: 'dark' }); });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark'); await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.setViewportSize({ width: 360, height: 900 });
  await expect(page.getByRole('heading', { name: 'Activity', exact: true })).toBeVisible();
  await expect(row('attention')).toContainText('Response available');
  await expect(elapsed('working')).toHaveText('Working for 4 min'); await expect(elapsed('attention')).toHaveText('Available for 2 min');
  await expect(elapsed('idle')).toHaveCount(0); await expect(elapsed('unsupported')).toHaveCount(0);
  await expect(heading('working')).toHaveText('ChatGPT · session 1'); await expect(place('working')).toHaveText('Tab 4');
  await expect(place('attention')).toHaveText('Tab 1 · other window');
  await audit('activity-360-dark-English'); await overflow(); await quietDurations(); await screenshot('activity_360_dark');
  await page.evaluate(() => window.__activity.rename('attention', 'W'.repeat(40)));
  await expect(heading('attention')).toHaveText(`${'W'.repeat(40)} — ChatGPT · session 2`); await overflow();
  expect(await heading('attention').evaluate(element => element.getBoundingClientRect().right <= element.closest('.activity-row').getBoundingClientRect().right + 1)).toBe(true);
  await renameButton('working', 'Name this session').focus(); await page.keyboard.press('Enter');
  await expect(nameField('working', 'Name for ChatGPT · session 1 (40 characters maximum, empty to clear)')).toBeFocused(); await page.keyboard.type('Contract review');
  await audit('activity-360-dark-English-rename'); await overflow(); expect(await clearLines(page, 'working')).toBe(true);
  await page.keyboard.press('Enter'); await expect(heading('working')).toHaveText('Contract review — ChatGPT · session 1');
  await expect(renameButton('working', 'Name this session')).toBeFocused();
  await renameButton('working', 'Name this session').click(); await page.keyboard.insertText('a\u2066b'); await page.keyboard.press('Enter');
  await expect(row('working').getByRole('alert')).toContainText('This name cannot be used'); await page.keyboard.press('Escape');
  await page.evaluate(() => { window.__activity.rename('attention', null); window.__activity.rename('working', null); });
  await page.evaluate(() => window.__activity.addAttention());
  await expect(page.getByRole('button', { name: 'Mark all as seen', exact: true })).toBeVisible();
  await expect(page.locator('.activity-shortcut')).toHaveText('Next item to review: Alt+Shift+J');
  await expect(elapsed('attention-2')).toHaveText('Input requested for under a minute');
  await page.evaluate(() => window.__activity.since('attention-2', 65 * 60_000 + 30_000, 'error_visible'));
  await expect(elapsed('attention-2')).toHaveText('Error visible for 1 h 05 min');
  await audit('activity-360-dark-English-mark-all'); await overflow(); await quietDurations();
  await page.evaluate(() => window.__activity.settings({ language: 'fr', theme: 'light' }));
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light'); await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  await expect(page.getByRole('button', { name: 'Tout marquer comme vu', exact: true })).toBeVisible();
  await expect(elapsed('attention-2')).toHaveText('Erreur visible depuis 1 h 05'); await expect(elapsed('working')).toHaveText('En cours depuis 4 min');
  await page.evaluate(() => window.__activity.since('attention', 30_000));
  await expect(elapsed('attention')).toHaveText('Réponse disponible depuis moins d’une minute');
  await page.evaluate(() => window.__activity.rename('attention-2', 'Revue contrat'));
  await expect(heading('attention-2')).toHaveText('Revue contrat — Claude · session 3'); await expect(place('attention-2')).toHaveText('Onglet 6');
  await audit('activity-360-light-French'); await overflow(); await quietDurations();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await page.locator('.button').first().evaluate(element => getComputedStyle(element).transitionDuration)).toBe('0s');
  await page.evaluate(() => window.__activity.noShortcuts());
  await expect(page.locator('.activity-shortcut')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Tout marquer comme vu', exact: true })).toBeVisible();
  pass('French/English, 360px light/dark, elapsed durations, session names and positions, mark all and shortcut hint, reduced motion, no overflow and zero axe violations; hint hidden without shortcut access');

  // Settings: optional automatic seen, off by default, as a labeled native select with its meaning as description.
  const nav = name => page.getByRole('navigation').getByRole('button', { name: new RegExp(`^${name}( \\d+)?$`) });
  const semantics = page.locator('.activity-semantics');
  await expect(semantics).not.toContainText('après');
  for (const [width, theme] of [[1365, 'light'], [360, 'dark']]) {
    await page.setViewportSize({ width, height: 900 }); await page.evaluate(value => window.__activity.settings({ language: 'fr', theme: value, autoAcknowledgeSeconds: 0 }), theme);
    await nav('Paramètres').click();
    const autoSeen = page.getByRole('combobox', { name: 'Marquer comme vu automatiquement', exact: true });
    await expect(page.getByRole('heading', { name: 'Activité', level: 2, exact: true })).toBeVisible();
    await expect(autoSeen).toHaveValue('0'); await expect(autoSeen.locator('option')).toHaveText(['Désactivé', '5 s', '15 s', '30 s']);
    // A no-break space keeps each delay with its unit (the matcher above normalizes whitespace).
    expect(await autoSeen.locator('option').allTextContents()).toEqual(['Désactivé', '5\u00a0s', '15\u00a0s', '30\u00a0s']);
    await expect(autoSeen).toHaveAccessibleDescription('Une attention est marquée comme vue après ce délai passé sur l’onglet concerné, fenêtre active. Vu signifie que vous l’avez remarquée, pas que la tâche a réussi.');
    await audit(`settings-auto-seen-${width}-${theme}-French`); await overflow();
    await autoSeen.focus(); await autoSeen.selectOption('15');
    await expect.poll(() => page.evaluate(() => window.__activity.savedSettings().autoAcknowledgeSeconds)).toBe(15);
    await expect(autoSeen).toHaveValue('15'); await expect(page.getByText('Préférences enregistrées.')).toBeVisible();
    await nav('Activité').click();
    await expect(semantics).toContainText('Une attention est marquée comme vue après 15 s sur son onglet, fenêtre active.');
    expect(await semantics.textContent()).toContain('après 15\u00a0s sur');
    await overflow();
  }
  await page.evaluate(() => window.__activity.settings({ language: 'en' }));
  await nav('Settings').click();
  const autoSeenEn = page.getByRole('combobox', { name: 'Mark as seen automatically', exact: true });
  await expect(autoSeenEn).toHaveValue('15'); await expect(autoSeenEn.locator('option')).toHaveText(['Off', '5 s', '15 s', '30 s']);
  await expect(autoSeenEn).toHaveAccessibleDescription('An item is marked as seen after this time on its tab, in the focused window. Seen means you noticed it, not that the task succeeded.');
  await audit('settings-auto-seen-360-dark-English'); await overflow();
  await autoSeenEn.selectOption('5'); await expect.poll(() => page.evaluate(() => window.__activity.savedSettings().autoAcknowledgeSeconds)).toBe(5);
  await nav('Activity').click(); await expect(semantics).toContainText('Items are marked as seen after 5 s on their tab, in the focused window.');
  expect(await semantics.textContent()).toContain('after 5\u00a0s on');
  await nav('Settings').click(); await autoSeenEn.selectOption('0'); await expect.poll(() => page.evaluate(() => window.__activity.savedSettings().autoAcknowledgeSeconds)).toBe(0);
  await nav('Activity').click(); await expect(semantics).not.toContainText('marked as seen after');
  await page.evaluate(() => window.__activity.settings({ language: 'fr', theme: 'light' })); await page.setViewportSize({ width: 360, height: 900 });
  await expect(page.getByRole('heading', { name: 'Activité', exact: true })).toBeVisible();
  pass('automatic seen setting: off by default, labeled select with its meaning as description, FR/EN, light/dark, 1365px and 360px, zero axe violations; the activity footer states the delay only when enabled');

  // Settings: optional OS notifications, one checkbox per service. Chrome's permission is requested from the click itself,
  // only for the first service, and removed with the last; a refusal changes nothing and is announced.
  const notifyCalls = () => page.evaluate(() => window.__activity.calls().notifications);
  const notifySaved = () => page.evaluate(() => window.__activity.savedSettings().notifyProviders);
  const notifyText = {
    fr: { group: 'Notifications système', help: 'Pilovo affiche une notification de votre système quand une réponse est disponible, qu’une intervention est demandée ou qu’une erreur est visible. Elle contient seulement le service, le motif et le numéro de session. Votre système peut la conserver dans son centre de notifications.', refused: 'Chrome n’a pas autorisé les notifications. Le réglage n’a pas changé.', removed: 'Chrome n’autorise plus les notifications de Pilovo : aucun service ne vous notifie. Cochez un service pour les réactiver.', unavailable: 'Les notifications système nécessitent l’extension Chrome installée.', unknown: 'L’autorisation des notifications n’a pas pu être vérifiée.', saved: 'Préférences enregistrées.' },
    en: { group: 'System notifications', help: 'Pilovo shows a system notification when a response is available, input is requested or an error is visible. It contains only the service, the reason and the session number. Your system may keep it in its notification center.', refused: 'Chrome did not allow notifications. The setting is unchanged.', removed: 'Chrome no longer allows Pilovo notifications, so no service notifies you. Check a service to turn them back on.', unavailable: 'System notifications require the installed Chrome extension.', unknown: 'The notification permission could not be checked.', saved: 'Preferences saved.' },
  };
  for (const [width, theme, language] of [[1365, 'light', 'fr'], [360, 'dark', 'fr'], [360, 'dark', 'en']]) {
    const text = notifyText[language];
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(([value, lang]) => { window.__activity.denyNotifications(false); window.__activity.notificationPermission(false); window.__activity.settings({ language: lang, theme: value, notifyProviders: [] }); }, [theme, language]);
    await nav(language === 'fr' ? 'Paramètres' : 'Settings').click();
    const group = page.getByRole('group', { name: text.group, exact: true }), state = group.locator('.notify-state');
    const claude = group.getByRole('checkbox', { name: 'Claude', exact: true }), chatgpt = group.getByRole('checkbox', { name: 'ChatGPT', exact: true });
    await expect(group).toHaveAccessibleDescription(text.help);
    await expect(claude).toBeEnabled(); await expect(claude).not.toBeChecked(); await expect(chatgpt).not.toBeChecked(); await expect(state).toHaveCount(0);
    await audit(`settings-notifications-${width}-${theme}-${language}`); await overflow();
    const asked = (await notifyCalls()).length, saved = page.getByRole('status').filter({ hasText: text.saved });
    // Granted, from the keyboard: the first service requests the permission inside the key press's user gesture, and the
    // checkbox keeps focus while the request and the save run.
    await claude.focus(); await page.keyboard.press('Space'); await expect.poll(notifySaved).toEqual(['claude-web']); await expect(claude).toBeChecked();
    await expect(saved).toBeVisible(); await expect(claude).toBeFocused();
    expect((await notifyCalls()).slice(asked)).toEqual([{ kind: 'request', gesture: true }]);
    await chatgpt.click(); await expect.poll(notifySaved).toEqual(['claude-web', 'chatgpt-web']); await expect(chatgpt).toBeChecked();
    await claude.click(); await expect.poll(notifySaved).toEqual(['chatgpt-web']); await expect(claude).not.toBeChecked();
    expect((await notifyCalls()).slice(asked)).toHaveLength(1);
    // The last one unchecked removes the permission.
    await chatgpt.click(); await expect.poll(notifySaved).toEqual([]); await expect(chatgpt).not.toBeChecked();
    await expect.poll(async () => (await notifyCalls()).slice(asked).map(call => call.kind)).toEqual(['request', 'remove']);
    // Refused, from the keyboard: the setting stays unchanged, the refusal is announced, the previous save's status goes
    // and focus stays on the checkbox.
    await expect(saved).toBeVisible();
    await page.evaluate(() => window.__activity.denyNotifications(true));
    await chatgpt.focus(); await page.keyboard.press('Space'); await expect(group.getByRole('alert')).toHaveText(text.refused);
    await expect(chatgpt).not.toBeChecked(); expect(await notifySaved()).toEqual([]); await expect(saved).toHaveCount(0); await expect(chatgpt).toBeFocused();
    expect((await notifyCalls()).at(-1)).toEqual({ kind: 'request', gesture: true });
    // A request that rejects or throws counts as a refusal.
    await page.evaluate(() => window.__activity.denyNotifications(false));
    for (const failure of ['reject', 'throw']) {
      await page.evaluate(value => window.__activity.failNotificationRequest(value), failure);
      const before = (await notifyCalls()).length;
      await claude.click(); await expect.poll(async () => (await notifyCalls()).length).toBe(before + 1);
      await expect(group.getByRole('alert')).toHaveText(text.refused); await expect(claude).not.toBeChecked(); expect(await notifySaved()).toEqual([]);
    }
    await page.evaluate(() => window.__activity.failNotificationRequest(null));
    await audit(`settings-notifications-refused-${width}-${theme}-${language}`); await overflow();
    // Removed in Chrome's settings: both read as off, with an explanation; checking one re-enables that one only.
    await page.evaluate(() => { window.__activity.denyNotifications(false); window.__activity.settings({ notifyProviders: ['claude-web', 'chatgpt-web'] }); window.__activity.notificationPermission(true); });
    await expect(claude).toBeChecked(); await expect(chatgpt).toBeChecked(); await expect(group.getByRole('alert')).toHaveCount(0);
    await page.evaluate(() => window.__activity.notificationPermission(false));
    await expect(claude).not.toBeChecked(); await expect(chatgpt).not.toBeChecked();
    await expect(state).toHaveText(text.removed); await expect(group).toHaveAccessibleDescription(`${text.help} ${text.removed}`);
    await audit(`settings-notifications-removed-${width}-${theme}-${language}`); await overflow();
    await claude.click(); await expect.poll(notifySaved).toEqual(['claude-web']);
    await expect(claude).toBeChecked(); await expect(chatgpt).not.toBeChecked(); await expect(state).toHaveCount(0);
    expect((await notifyCalls()).at(-1)).toEqual({ kind: 'request', gesture: true });
    // The permission cannot be read: both boxes are disabled, and the group's description says why.
    await page.evaluate(() => window.__activity.failNotificationRead(true));
    await expect(state).toHaveText(text.unknown); for (const box of [claude, chatgpt]) await expect(box).toBeDisabled();
    await expect(group).toHaveAccessibleDescription(`${text.help} ${text.unknown}`);
    await audit(`settings-notifications-unknown-${width}-${theme}-${language}`); await overflow();
    await page.evaluate(() => window.__activity.failNotificationRead(false));
    await expect(claude).toBeEnabled(); await expect(claude).toBeChecked(); await expect(state).toHaveCount(0);
  }
  // The browser preview has no permission methods: the checkboxes are disabled and say why.
  await page.evaluate(() => window.__activity.noNotifications());
  const previewGroup = page.getByRole('group', { name: notifyText.en.group, exact: true });
  for (const name of ['Claude', 'ChatGPT']) { await expect(previewGroup.getByRole('checkbox', { name, exact: true })).toBeDisabled(); await expect(previewGroup.getByRole('checkbox', { name, exact: true })).not.toBeChecked(); }
  await expect(previewGroup.locator('.notify-state')).toHaveText(notifyText.en.unavailable);
  await expect(previewGroup).toHaveAccessibleDescription(`${notifyText.en.help} ${notifyText.en.unavailable}`);
  await audit('settings-notifications-preview-360-dark-en'); await overflow();
  await page.evaluate(() => window.__activity.settings({ language: 'fr', theme: 'light', notifyProviders: [] })); await page.setViewportSize({ width: 360, height: 900 });
  await nav('Activité').click(); await expect(page.getByRole('heading', { name: 'Activité', exact: true })).toBeVisible();
  pass('system notifications setting: one checkbox per service, permission requested inside the click or key press and removed with the last service, keyboard focus kept, refusal (or a failed request) announced without change and without a stale saved status, removal in Chrome shown as off with re-enable, unreadable permission and preview disabled with their reason, FR/EN, 1365px and 360px, light/dark, zero axe violations');

  // Seen elsewhere (automatic seen after dwelling on the tab, the keyboard command or another panel) removes the control
  // that had focus: focus moves to the row's open button, or from mark all to the first row action, never to the page.
  for (const [language, seenName, openName, allName, seenState] of [['fr', 'Marquer comme vu', 'Ouvrir la session', 'Tout marquer comme vu', 'Vu'], ['en', 'Mark as seen', 'Open session', 'Mark all as seen', 'Seen']]) {
    await page.evaluate(value => { window.__activity.settings({ language: value }); window.__activity.seed(); }, language);
    const seenButton = row('attention').getByRole('button', { name: seenName, exact: true });
    await seenButton.focus(); await page.evaluate(() => window.__activity.seenElsewhere(['attention']));
    await expect(row('attention').locator('.activity-state')).toHaveText(seenState); await expect(seenButton).toHaveCount(0);
    await expect(row('attention').getByRole('button', { name: openName, exact: true })).toBeFocused();
    await page.evaluate(() => { window.__activity.seed(); window.__activity.addAttention(); });
    const all = page.getByRole('button', { name: allName, exact: true });
    await all.focus(); await page.evaluate(() => window.__activity.seenElsewhere(['attention-2']));
    await expect(row('attention-2').locator('.activity-state')).toHaveText(seenState); await expect(all).toHaveCount(0);
    await expect(page.locator('.activity-row').first().getByRole('button', { name: openName, exact: true })).toBeFocused();
    await audit(`activity-seen-elsewhere-${language}`);
    // Focus on any other control stays where it is.
    const refreshButton = page.getByRole('button', { name: language === 'fr' ? 'Actualiser l’activité' : 'Refresh activity', exact: true });
    await refreshButton.focus(); await page.evaluate(() => window.__activity.seenElsewhere(['attention']));
    await expect(row('attention').locator('.activity-state')).toHaveText(seenState); await expect(refreshButton).toBeFocused();
    // A row that lapses disables its open button: the rename button, which stays focusable, takes focus instead.
    await page.evaluate(() => window.__activity.seed()); await seenButton.focus(); await page.evaluate(() => window.__activity.expire('attention'));
    await expect(seenButton).toHaveCount(0); await expect(row('attention').getByRole('button', { name: openName, exact: true })).toBeDisabled();
    await expect(row('attention').locator('.activity-rename')).toBeFocused();
  }
  await page.evaluate(() => window.__activity.settings({ language: 'fr' }));
  pass('seen elsewhere, as automatic seen does: focus on the removed seen or mark-all button moves to the row actions (the rename button once the row lapsed), never to the page, FR/EN, zero axe violations');

  await page.evaluate(() => { window.__activity.hold(true); window.__activity.signal(); });
  const unmountRequest = await page.evaluate(() => window.__activity.pending() - 1);
  // Durations are shown, so the minute ticker is armed; unmounting clears it and the expiry timer.
  await expect.poll(minuteTicker).not.toEqual([]);
  expect(await page.evaluate(() => { window.__activity.unmount(); return window.__activity.timers(); })).toEqual([]);
  expect(await page.evaluate(() => window.__activity.listeners())).toBe(0);
  await page.evaluate(index => window.__activity.resolve(index), unmountRequest);
  await expect(page.locator('#root')).toBeEmpty();
  await page.goto(`${base}/tests/ui/activity-harness.html?legacy`);
  await expect(page.getByRole('heading', { name: 'L’observation nécessite l’extension' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Connecter Claude', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Ouvrir Claude', exact: true })).toBeEnabled();
  await audit('activity-unavailable');
  pass('subscriptions dispose; late completions are ignored; optional-method preview is truthfully unavailable');

  // DESIGN.md: 44 px coarse-pointer targets, including the compact activity actions.
  const touch = await browser.newContext({ viewport: { width: 1200, height: 900 }, hasTouch: true, colorScheme: 'light' });
  const touchPage = await touch.newPage();
  touchPage.on('pageerror', error => report.errors.push(error.message));
  await touchPage.goto(`${base}/tests/ui/activity-harness.html`);
  await touchPage.evaluate(() => { window.__activity.seed(); window.__activity.addAttention(); });
  for (const width of [1200, 360]) {
    await touchPage.setViewportSize({ width, height: 900 });
    await expect(touchPage.getByRole('button', { name: 'Tout marquer comme vu', exact: true })).toBeVisible();
    expect(await touchPage.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
    const heights = await touchPage.locator('.activity-bulk .button, .activity-row-actions .button').evaluateAll(buttons => buttons.map(button => button.getBoundingClientRect().height));
    expect(heights.length).toBeGreaterThan(2); expect(Math.min(...heights)).toBeGreaterThanOrEqual(44);
    const renames = await touchPage.locator('.activity-rename').evaluateAll(buttons => buttons.map(button => { const box = button.getBoundingClientRect(); return Math.min(box.width, box.height); }));
    expect(renames).toHaveLength(5); expect(Math.min(...renames)).toBeGreaterThanOrEqual(44);
    // The taller coarse targets, and the open field with its focus ring, stay clear of the state and position lines.
    for (const id of ['working', 'attention', 'idle']) expect(await clearLines(touchPage, id), `${width} ${id}`).toBe(true);
    await touchPage.locator('[data-activity-id="working"] .activity-rename').click();
    expect(await touchPage.locator('.activity-rename-form input').evaluate(input => input.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
    await expect(touchPage.locator('.activity-rename-form input')).toBeFocused(); expect(await clearLines(touchPage, 'working'), `${width} field`).toBe(true);
    await touchPage.keyboard.press('Escape');
  }
  // Without a readable panel window (preview), rows keep their position but never claim another window.
  await expect(touchPage.locator('[data-activity-id="attention"] .activity-place')).toHaveText('Onglet 1 · autre fenêtre');
  await touchPage.evaluate(() => window.__activity.noWindow());
  await expect(touchPage.locator('[data-activity-id="attention"] .activity-place')).toHaveText('Onglet 1');
  // The notification checkboxes' labels are their targets: 44 px tall on coarse pointers.
  await touchPage.getByRole('navigation').getByRole('button', { name: 'Paramètres', exact: true }).click();
  const notifyTargets = await touchPage.locator('.notify-options .checkbox-label').evaluateAll(labels => labels.map(label => label.getBoundingClientRect().height));
  expect(notifyTargets).toHaveLength(2); expect(Math.min(...notifyTargets)).toBeGreaterThanOrEqual(44);
  await touch.close();
  pass('mark all, row actions, rename button and field, and the notification checkboxes keep 44 px coarse-pointer targets at 1200px and 360px, clear of the state and position lines; no window claim without the panel window');
  expect(report.errors).toEqual([]);
} catch (error) { report.failure = String(error); await page.screenshot({ path: path.join(output, 'Pilovo-activity-failure-synthetic.png'), fullPage: true }); throw error; }
finally { await writeFile(path.join(output, 'Pilovo-activity-report.json'), JSON.stringify(report, null, 2)); await browser.close(); }
console.log(JSON.stringify(report));
