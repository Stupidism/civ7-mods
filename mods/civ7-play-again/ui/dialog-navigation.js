// Scope input to this mod's dialog; never bind a global gamepad shortcut.
export function bindDialogNavigation(root, { focus, statuses, directions, activate }) {
  const controls = () => [...root.querySelectorAll('fxs-textbox, fxs-button')]
    .filter(node => node.getAttribute('disabled') !== 'true' && !node.closest('.hidden') && node.style.display !== 'none');
  const stop = event => { event.preventDefault(); event.stopImmediatePropagation(); };
  function move(event) {
    const direction = event.getDirection?.() ?? event.detail?.navigation;
    const step = [directions.UP, directions.PREVIOUS].includes(direction) ? -1 :
      [directions.DOWN, directions.NEXT].includes(direction) ? 1 : 0;
    if (!step) return; // Native text editing keeps horizontal movement.
    stop(event);
    if (event.detail?.status !== statuses.FINISH) return;
    const items = controls();
    if (!items.length) return;
    const index = items.indexOf(focus.currentFocus()?.closest?.('fxs-textbox, fxs-button')); 
    const target = items[index < 0 ? 0 : (index + step + items.length) % items.length];
    focus.setFocus(target); target.scrollIntoView?.({ block: 'nearest' });
  }
  function input(event) {
    if (!['accept', 'keyboard-enter'].includes(event.detail?.name)) return;
    const current = focus.currentFocus();
    if (current?.closest?.('fxs-textbox')) return; // Let the native textbox/IME handle editing.
    const buttons = controls().filter(node => node.tagName.toLowerCase() === 'fxs-button');
    const button = current?.closest?.('fxs-button');
    const target = buttons.includes(button) ? button : buttons[0];
    if (!target) return;
    stop(event);
    if (event.detail.status === statuses.FINISH) activate(target);
  }
  root.addEventListener('navigate-input', move, true);
  root.addEventListener('engine-input', input, true);
  return () => {
    root.removeEventListener('navigate-input', move, true);
    root.removeEventListener('engine-input', input, true);
  };
}
