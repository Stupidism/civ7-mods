import { formatTime, clockTime } from './rest-model.js';
import { IDLE_HINT_MS, IDLE_REST_MS } from './rest-session.js';

// Resolve through the game's active text language, never the OS/browser locale.
const t = (key, ...args) => Locale.compose(`LOC_RG_${key}`, ...args);

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export class RestView {
  constructor(callbacks) {
    this.callbacks = callbacks;
    this.actions = new Map();
    this.sequence = 0;
    this.mode = null;
    // Native font-body follows the display locale and includes CJK glyph fonts.
    this.root = element('div', 'c7r-root font-body');
    this.visible = true;
    this.launcher = this.button(t('OPEN_SETTINGS'), () => this.callbacks.openSettings(), 'c7r-launcher font-title-base', 'fxs-activatable');
    this.launcher.textContent = '';
    this.launcherNumbers = element('div', 'c7r-launcher-numbers');
    const metric = iconClass => {
      const row = element('div', 'c7r-metric');
      const icon = element('div', `c7r-icon ${iconClass}`);
      icon.setAttribute('aria-hidden', 'true');
      const value = element('div', 'c7r-metric-value');
      row.appendChild(icon); row.appendChild(value); this.launcherNumbers.appendChild(row);
      return { row, value };
    };
    this.turnMetric = metric('c7r-turn-icon');
    this.separator = element('div', 'c7r-or', '/');
    this.launcherNumbers.appendChild(this.separator);
    this.timeMetric = metric('c7r-time-icon');
    this.offLabel = element('div', 'c7r-off-label', t('OFF'));
    this.launcherNumbers.appendChild(this.offLabel);
    this.idleHint = element('div', 'c7r-idle-hint');
    this.launcher.appendChild(this.launcherNumbers);
    this.launcher.appendChild(this.idleHint);
    this.root.appendChild(this.launcher);
    document.body.appendChild(this.root);
    this.mountLauncher();
  }

  mountLauncher() {
    // Share the native clock's layout and typography, immediately to its left.
    // Keep a sibling: the game's clock refresh replaces its own textContent.
    const clock = document.querySelector('panel-system-bar #ps-clock');
    const host = clock?.parentElement;
    if (host && (this.launcher.parentElement !== host || this.launcher.nextElementSibling !== clock)) {
      host.insertBefore(this.launcher, clock);
    }
    this.launcher.style.display = host && this.visible && !this.mode ? '' : 'none';
  }

  setVisible(visible) {
    this.visible = visible;
    this.root.style.display = visible ? '' : 'none';
    this.mountLauncher();
  }

  button(label, onActivate, className = '', tag = 'fxs-button') {
    const button = element(tag, `c7r-button ${className}`);
    if (tag === 'fxs-button') {
      button.setAttribute('caption', label);
      button.setAttribute('action-key', 'inline-accept');
    }
    const id = String(++this.sequence);
    button.setAttribute('data-c7r-action', id);
    button.setAttribute('tabindex', '0');
    button.setAttribute('role', 'button');
    button.setAttribute('aria-label', label);
    this.actions.set(id, onActivate);
    // A native click also produces action-activate and DOM click notifications.
    // Modal controls are dispatched once by RestController's engine-input guard.
    // Only the HUD launcher uses the ordinary component activation path.
    button.addEventListener('action-activate', () => {
      if (!this.modal) this.activate(button);
    });
    return button;
  }

  activate(target) {
    const button = target?.closest?.('[data-c7r-action]');
    if (!button || (!this.root.contains(button) && button !== this.launcher) || button.getAttribute('disabled') === 'true') return;
    if (this.modal && !this.modal.contains(button)) return;
    this.actions.get(button.getAttribute('data-c7r-action'))?.();
  }

  focusAction(button) {
    if (!button || button.getAttribute('disabled') === 'true') return;
    this.focusedAction?.removeAttribute?.('data-c7r-focused');
    this.focusedAction = button;
    button.setAttribute('data-c7r-focused', 'true');
    this.callbacks.setFocus?.(button);
  }

  ensureFocus() {
    if (!this.modal || this.callbacks.hasDialog?.()) return;
    const available = [this.continueButton, this.quitButton].filter(b => b && this.modal.contains(b) && b.getAttribute('disabled') !== 'true');
    const current = this.callbacks.currentFocus?.()?.closest?.('[data-c7r-action]');
    if (available.includes(current)) {
      if (this.focusedAction !== current) this.focusAction(current);
      return;
    }
    this.focusAction(available.includes(this.focusedAction) ? this.focusedAction : available[0]);
  }

  navigate(step) {
    if (this.callbacks.hasDialog?.()) return;
    const buttons = [this.continueButton, this.quitButton].filter(b => b && this.modal?.contains(b) && b.getAttribute('disabled') !== 'true');
    if (!buttons.length) return;
    const current = this.callbacks.currentFocus?.() ?? this.focusedAction;
    const index = buttons.indexOf(current);
    this.focusAction(buttons[index < 0 ? 0 : (index + step + buttons.length) % buttons.length]);
  }

  activateFocused() {
    if (this.callbacks.hasDialog?.()) return;
    this.ensureFocus();
    this.activate(this.focusedAction);
  }

  open(mode) {
    this.close();
    // Use the game's popup stack instead of a body-level overlay above every
    // screen. Existing ordinary panels stay below us; native dialogs stay above.
    const popups = document.querySelector?.('.fxs-popups');
    if (popups) {
      const dialog = document.querySelector('screen-dialog-box');
      if (dialog?.parentElement === popups) popups.insertBefore(this.root, dialog);
      else popups.appendChild(this.root);
    }
    this.previousFocus = this.callbacks.currentFocus?.();
    this.focusedAction = null;
    this.mode = mode;
    this.modal = element('div', 'c7r-overlay');
    this.modal.setAttribute('role', 'dialog');
    this.modal.setAttribute('aria-modal', 'true');
    this.card = element('fxs-frame', `c7r-card c7r-card-${mode}`);
    this.card.setAttribute('frame-style', 'f1');
    this.card.setAttribute('override-styling', 'relative flex flex-col pointer-events-auto');
    this.card.setAttribute('content-class', 'c7r-card-content');
    this.card.setAttribute('filigree-class', 'mt-3');
    this.modal.appendChild(this.card);
    this.root.appendChild(this.modal);
    this.launcher.style.display = 'none';
  }

  close() {
    if (this.modal) {
      this.modal.querySelectorAll('[data-c7r-action]').forEach(node =>
        this.actions.delete(node.getAttribute('data-c7r-action')));
      this.modal.remove();
    }
    if (this.previousFocus?.isConnected && !this.callbacks.hasDialog?.()) this.callbacks.setFocus?.(this.previousFocus);
    this.previousFocus = null;
    this.focusedAction = null;
    this.modal = null;
    this.mode = null;
    this.mountLauncher();
  }

  title(text) {
    const title = element('fxs-header', 'c7r-title font-title text-xl');
    title.setAttribute('title', text);
    title.setAttribute('filigree-style', 'h2');
    this.card.appendChild(title);
  }

  showRest(pending) {
    if (this.mode === 'rest') return;
    const reason = pending.reason === 'time' ? t('TIME_DUE') : t('TURN_DUE', pending.turn);
    this.showBreak('rest', t('FORCED_TITLE'), t('BREAK_SUBTITLE', reason, pending.durationMs / 60000),
      t('FORCED_NOTE'));
    this.updateRest(pending.durationMs, pending.durationMs);
  }

  showNight(night, config, now) {
    if (this.mode !== 'night') {
      this.showBreak('night', t('NIGHT_TITLE'), t('NIGHT_SUBTITLE'),
        t('NIGHT_NOTE'));
    }
    const seconds = Math.ceil(Math.max(0, night.endsAt - now) / 1000);
    this.timer.textContent = `${String(Math.floor(seconds / 3600)).padStart(2, '0')}:${formatTime((seconds % 3600) * 1000)}`;
    this.progress.style.width = `${Math.min(100, Math.max(0, (now - night.startedAt) / Math.max(1, night.endsAt - night.startedAt) * 100))}%`;
    this.message.textContent = t('NIGHT_MESSAGE', clockTime(config.nightStart), clockTime(config.nightEnd));
    this.continueButton.setAttribute('disabled', 'true');
    this.continueButton.setAttribute('caption', t('NIGHT_WAIT'));
    this.continueButton.setAttribute('aria-label', t('NIGHT_WAIT'));
    this.modal.setAttribute('aria-label', t('NIGHT_TIMER'));
    this.ensureFocus();
  }

  showIdleRest() {
    if (this.mode === 'idle') return;
    this.showBreak('idle', t('IDLE_TITLE'), t('IDLE_SUBTITLE'),
      t('IDLE_NOTE'));
    this.updateIdleRest(0, false);
  }

  showBreak(mode, title, subtitle, footnote) {
    this.open(mode);
    this.modal.setAttribute('aria-label', mode === 'idle' ? t('IDLE_TIMER') : t('FORCED_TIMER'));
    this.title(title);
    this.card.appendChild(element('p', 'c7r-subtitle', subtitle));
    this.timer = element('div', 'c7r-timer');
    this.timer.setAttribute('role', 'timer');
    this.card.appendChild(this.timer);
    const track = element('div', 'c7r-track');
    this.progress = element('div', 'c7r-progress');
    track.appendChild(this.progress);
    this.card.appendChild(track);
    this.message = element('p', 'c7r-tip', t('BREAK_TIP'));
    this.card.appendChild(this.message);
    const actions = element('div', 'c7r-actions');
    this.continueButton = this.button(t('BREAK_WAIT'), () => this.callbacks.resume(), 'c7r-primary c7r-continue');
    this.quitButton = this.button(t('EXIT_GAME'), () => this.callbacks.quit(), 'c7r-quit');
    actions.appendChild(this.continueButton);
    actions.appendChild(this.quitButton);
    this.card.appendChild(actions);
    this.card.appendChild(element('p', 'c7r-footnote', footnote));
    this.saveStatus = element('p', 'c7r-footnote c7r-save-status');
    this.saveStatus.setAttribute('role', 'status');
    this.card.appendChild(this.saveStatus);
  }

  updateSaveStatus(state) {
    if (!this.saveStatus) return;
    const labels = {
      waiting: t('SAVE_WAITING'),
      saving: t('SAVE_SAVING'),
      saved: t('SAVE_SAVED'),
      failed: t('SAVE_FAILED'),
      unavailable: t('SAVE_UNAVAILABLE'),
      unconfirmed: t('SAVE_UNCONFIRMED'),
    };
    this.saveStatus.textContent = state ? (labels[state.status] ?? labels.unconfirmed) : '';
    if (state?.status === 'saved' && state.cleanup === 'failed') this.saveStatus.textContent += t('CLEANUP_FAILED');
    this.saveStatus.setAttribute('data-tooltip-content', state?.fileName ?? '');
  }

  updateIdleRest(elapsed, rested) {
    if (this.mode !== 'idle') return;
    this.timer.textContent = formatTime(elapsed);
    this.progress.style.width = `${Math.min(100, Math.max(0, elapsed / IDLE_REST_MS * 100))}%`;
    this.continueButton.setAttribute('disabled', 'false');
    this.continueButton.setAttribute('caption', t('CONTINUE'));
    this.continueButton.setAttribute('aria-label', t('CONTINUE'));
    this.message.textContent = rested ? t('IDLE_COMPLETE') :
      t('IDLE_TIP');
    this.ensureFocus();
  }

  updateRest(remaining, duration) {
    if (this.mode !== 'rest') return;
    this.timer.textContent = formatTime(remaining);
    this.progress.style.width = `${Math.min(100, Math.max(0, (1 - remaining / duration) * 100))}%`;
    const ready = remaining <= 0;
    this.continueButton.setAttribute('disabled', String(!ready));
    this.continueButton.setAttribute('caption', ready ? t('BREAK_CONTINUE') : t('BREAK_WAIT'));
    this.continueButton.setAttribute('aria-label', ready ? t('BREAK_CONTINUE') : t('BREAK_WAIT'));
    this.message.textContent = ready ? t('BREAK_COMPLETE') : t('BREAK_TIP');
    this.ensureFocus();
  }

  updateLauncher(current, config, error, session, now) {
    this.mountLauncher();
    const turns = session.turnsRemaining(current, config);
    const remaining = Math.max(0, config.playMinutes * 60000 - session.elapsed(now));
    this.turnMetric.row.style.display = config.turnEnabled ? '' : 'none';
    this.timeMetric.row.style.display = config.timeEnabled ? '' : 'none';
    this.separator.style.display = config.turnEnabled && config.timeEnabled ? '' : 'none';
    this.offLabel.style.display = config.turnEnabled || config.timeEnabled || config.nightEnabled ? 'none' : '';
    this.turnMetric.value.textContent = String(turns);
    this.timeMetric.value.textContent = formatTime(remaining);
    const idle = config.timeEnabled ? session.idle(now) : 0;
    // Idle text replaces the metrics in the same single row, above the leader HUD.
    this.launcherNumbers.style.display = idle >= IDLE_HINT_MS ? 'none' : '';
    this.idleHint.style.display = idle >= IDLE_HINT_MS ? '' : 'none';
    this.idleHint.textContent = t('IDLE_ELAPSED', Math.floor(idle / 60000), Math.floor(idle / 1000) % 60);
    const secondsRemaining = Math.ceil(remaining / 1000);
    const until = [config.turnEnabled ? t('TURNS_LEFT', turns) : '',
      config.timeEnabled ? t('TIME_LEFT', Math.floor(secondsRemaining / 60), secondsRemaining % 60) : ''].filter(Boolean);
    let tooltip = until.length ? t('UNTIL_BREAK', until.join(t('OR')), config.restMinutes) : t('TIMERS_OFF');
    if (config.nightEnabled) tooltip += t('NIGHT_HUD', clockTime(config.nightStart), clockTime(config.nightEnd));
    if (!config.turnEnabled && !config.timeEnabled && config.nightEnabled) { this.offLabel.style.display = ''; this.offLabel.textContent = t('NIGHT_ONLY'); }
    else this.offLabel.textContent = t('OFF');
    if (config.turnEnabled && turns <= 1) tooltip += t('TURN_END_HINT');
    if (idle >= IDLE_HINT_MS) tooltip += this.idleHint.textContent + (session.idleRested ? t('IDLE_DONE_HINT') : t('IDLE_SHORT_HINT'));
    tooltip += t('SETTINGS_HINT');
    if (error) tooltip += t('SETTINGS_ERROR_HINT');
    this.launcher.setAttribute('data-tooltip-content', tooltip);
    this.launcher.setAttribute('aria-label', tooltip);
  }

  destroy() { this.actions.clear(); this.launcher.remove(); this.root.remove(); }
}
