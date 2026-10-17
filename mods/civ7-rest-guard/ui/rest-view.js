import { formatTime } from './rest-model.js';
import { IDLE_HINT_MS } from './rest-session.js';

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
    this.root = element('div', 'c7r-root');
    this.visible = true;
    this.launcher = this.button('休息设置', () => this.callbacks.openSettings(), 'c7r-launcher font-title-base', 'fxs-activatable');
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
    this.offLabel = element('div', 'c7r-off-label', '已关闭');
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
    if (tag === 'fxs-button') button.setAttribute('caption', label);
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

  open(mode) {
    this.close();
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
    this.open('rest');
    this.modal.setAttribute('aria-label', '强制休息倒计时');
    this.title('强制休息');
    const reason = pending.reason === 'time' ? '连续游戏时间已到' : `第 ${pending.turn} 回合结束`;
    this.card.appendChild(element('p', 'c7r-subtitle', `${reason} · 休息 ${pending.durationMs / 60000} 分钟`));
    this.timer = element('div', 'c7r-timer', formatTime(pending.durationMs));
    this.timer.setAttribute('role', 'timer');
    this.card.appendChild(this.timer);
    const track = element('div', 'c7r-track');
    this.progress = element('div', 'c7r-progress');
    track.appendChild(this.progress);
    this.card.appendChild(track);
    this.message = element('p', 'c7r-tip', '起身走一走，喝口水，看看远处。');
    this.card.appendChild(this.message);
    this.continueButton = this.button('休息中，请稍候', () => this.callbacks.resume(), 'c7r-primary c7r-continue');
    this.continueButton.setAttribute('disabled', 'true');
    this.card.appendChild(this.continueButton);
    this.card.appendChild(element('p', 'c7r-footnote', '倒计时结束前无法关闭。切换到其他窗口，休息计时仍会继续。'));
  }

  updateRest(remaining, duration) {
    if (this.mode !== 'rest') return;
    this.timer.textContent = formatTime(remaining);
    this.progress.style.width = `${Math.min(100, Math.max(0, (1 - remaining / duration) * 100))}%`;
    const ready = remaining <= 0;
    this.continueButton.setAttribute('disabled', String(!ready));
    this.continueButton.setAttribute('caption', ready ? '休息完成，继续' : '休息中，请稍候');
    this.message.textContent = ready ? '休息结束。继续后，回合与时间间隔一同重新计算。' : '起身走一走，喝口水，看看远处。';
  }

  updateLauncher(current, config, error, session, now) {
    this.mountLauncher();
    const turns = Math.max(0, session.targetTurn(current, config) - current.turn);
    const remaining = Math.max(0, config.playMinutes * 60000 - session.elapsed(now));
    this.turnMetric.row.style.display = config.turnEnabled ? '' : 'none';
    this.timeMetric.row.style.display = config.timeEnabled ? '' : 'none';
    this.separator.style.display = config.turnEnabled && config.timeEnabled ? '' : 'none';
    this.offLabel.style.display = config.turnEnabled || config.timeEnabled ? 'none' : '';
    this.turnMetric.value.textContent = String(turns);
    this.timeMetric.value.textContent = formatTime(remaining);
    const idle = config.timeEnabled ? session.idle(now) : 0;
    // Idle text replaces the metrics in the same single row, above the leader HUD.
    this.launcherNumbers.style.display = idle >= IDLE_HINT_MS ? 'none' : '';
    this.idleHint.style.display = idle >= IDLE_HINT_MS ? '' : 'none';
    this.idleHint.textContent = `已休息 ${Math.floor(idle / 60000)} 分 ${Math.floor(idle / 1000) % 60} 秒`;
    const secondsRemaining = Math.ceil(remaining / 1000);
    const until = [config.turnEnabled ? `${turns} 回合` : '',
      config.timeEnabled ? `${Math.floor(secondsRemaining / 60)} 分 ${secondsRemaining % 60} 秒` : ''].filter(Boolean);
    let tooltip = until.length ? `还有 ${until.join(' 或 ')}强制休息 ${config.restMinutes} 分钟。` : '按回合休息和按时间休息均已关闭。';
    if (config.turnEnabled && turns === 0) tooltip += '本回合结束时触发。';
    if (idle >= IDLE_HINT_MS) tooltip += this.idleHint.textContent + (session.idleRested ? '；已完成一次休息。' : '；满5分钟算休息一次。');
    tooltip += '点击打开选项 → 附加内容 → 休息一下。';
    if (error) tooltip += '设置保存异常。';
    this.launcher.setAttribute('data-tooltip-content', tooltip);
    this.launcher.setAttribute('aria-label', tooltip);
  }

  destroy() { this.actions.clear(); this.launcher.remove(); this.root.remove(); }
}
