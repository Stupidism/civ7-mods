// Menu-only scroll ownership, after calibrated stick mapping. Never activates a control.
export function createScrollNavigation({ document, window, focus, statuses: S, root,
  navigationTray,
  now = () => performance.now() }) {
  const selector = 'fxs-scrollable,[data-name="ScrollArea"]';
  let selected, scope, horizontal = false, pressed = false, armed = false, speed = 0, last = now(), sample = 0, marked;
  let verticalSince=null;
  let marker;
  const suppressedNativeHelps = new Set();
  function stopVertical() { speed=0; verticalSince=null; }
  function setVertical(value) {
    if (!value) { stopVertical(); return; }
    if (!speed || Math.sign(value)!==Math.sign(speed)) verticalSince=now();
    speed=Math.max(-1,Math.min(1,value));
  }
  function acceleration(viewport,time) {
    // Keep the familiar short-list acceleration, but never let its old 2.5x
    // cap dominate a long list. Once the 1200 ms ramp is complete, full stick
    // deflection must be able to cross the complete range in three seconds.
    const height=Number(viewport.scrollHeight), client=Number(viewport.clientHeight);
    const dimensions=Number.isFinite(height)&&Number.isFinite(client)&&client>0;
    const ratio=dimensions?height/client:1;
    const contentLimit=1+Math.min(1.5,.4*Math.sqrt(Math.max(0,ratio-1)));
    const range=dimensions?Math.max(0,height-client):0;
    // Reserve 200 ms for normal frame jitter and the browser's integer-pixel
    // rounding. The requirement is crossing within three seconds, not using
    // exactly all three seconds; there is still no pixel multiplier cap.
    const traversalMs=2800;
    const fullRangeLimit=Math.max(1,range/traversalMs/.75);
    const limit=Math.max(contentLimit,fullRangeLimit);
    const ramp=Math.max(0,Math.min(1,((time-(verticalSince??time))-600)/1200));
    return 1+(limit-1)*ramp*ramp*(3-2*ramp);
  }
  const ownedTracks = new Set();
  const visible = el => {
    if (!el?.isConnected || el.closest('[hidden],.hidden,[aria-hidden="true"]')) return false;
    const style = window.getComputedStyle(el), r = el.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && r.width > 0 && r.height > 0;
  };
  function areas() {
    const host = root();
    if (scope !== host) { reset(); scope = host; }
    if (!host) return [];
    return [...host.querySelectorAll(selector)].filter(visible).map(el => {
      const viewport = el.tagName === 'FXS-SCROLLABLE'
        ? el.querySelector('.fxs-scrollable-content-container') : el.firstElementChild;
      return { el, viewport };
    }).filter(a => (a.el.tagName!=='FXS-SCROLLABLE' || typeof a.el.component?.setScrollThumbPosition==='function') && visible(a.viewport) && a.viewport.scrollHeight > a.viewport.clientHeight + 2)
      .sort((a,b) => a.viewport.getBoundingClientRect().left-b.viewport.getBoundingClientRect().left);
  }
  function choose(list) {
    if (!list.some(a=>a.el===selected)) {
      stopVertical(); horizontal=false; armed=false;
      const focused = focus.currentFocus();
      selected = (list.find(a=>a.el.contains(focused)) || list.find(a=>a.el.getAttribute('handle-gamepad-pan')==='true') || list[0])?.el;
    }
    return list.find(a=>a.el===selected);
  }
  function center(a) {
    if (!a) return false;
    const box=a.viewport.getBoundingClientRect(), cx=(box.left+box.right)/2, cy=(box.top+box.bottom)/2;
    const candidates=[...a.viewport.querySelectorAll('[tabindex]')].filter(el=>{
      if (!visible(el) || el.hasAttribute('slot') || el.getAttribute('disabled')==='true' || el.getAttribute('disabled')==='' || el.getAttribute('aria-disabled')==='true') return false;
      // A slot/container is not an actionable row. Focus its leaf control instead.
      if (el.querySelector('[tabindex]')) return false;
      const r=el.getBoundingClientRect();
      return r.bottom>box.top && r.top<box.bottom && r.right>box.left && r.left<box.right;
    }).sort((a,b)=>{
      const distance=el=>{const r=el.getBoundingClientRect();return Math.hypot((r.left+r.right)/2-cx,(r.top+r.bottom)/2-cy);};
      return distance(a)-distance(b);
    });
    if (!candidates.length) return false; // Read-only details must not steal focus from the save list.
    stopVertical(); focus.setFocus(candidates[0]); return true;
  }
  function popupOwnsInput(name, status, x, y) {
    const target = focus.currentFocus();
    if (!target || typeof target.dispatchEvent !== 'function' || typeof CustomEvent !== 'function') return false;
    let event;
    try {
      event = new CustomEvent('civ7-controller-scroll', {
        bubbles: true, cancelable: true, detail: { name, status, x, y }
      });
      target.dispatchEvent(event);
    } catch (_) {
      return false; // A popup implementation must never break native menu scrolling.
    }
    return event.defaultPrevented;
  }
  function popupOwnsFrame() {
    if (!popupOwnsInput('probe', 0, 0, 0)) return false;
    reset(); // Stop held motion, remove our hints, and clear the active marker.
    return true;
  }
  function activeSaveLoadPage(host) {
    if (host!==document && host!==document.documentElement && host!==document.body && !host?.isConnected) return null;
    if (host===document || host===document.documentElement || host===document.body) {
      // The ContextManager target is normally the page itself. Only use this
      // fallback when there is exactly one visible save/load page, so a hidden
      // or unrelated page can never inherit page-specific hint suppression.
      const focused=focus.currentFocus();
      const pages=[...document.querySelectorAll('screen-save-load')]
        .filter(page => visible(page) && page.contains(focused));
      return pages.length===1 ? pages[0] : null;
    }
    const page=host.tagName==='SCREEN-SAVE-LOAD' ? host : host.closest?.('screen-save-load');
    return page && visible(page) ? page : null;
  }
  function saveLoadNativeHelps(host) {
    const page=activeSaveLoadPage(host);
    if (!page) return [];
    const pane=[...page.querySelectorAll('.screen-save__description__scrollable')]
      .find(el => el.tagName==='FXS-SCROLLABLE' && el.getAttribute('handle-gamepad-pan')==='true' && visible(el));
    const thumb=pane?.querySelector('.fxs-scrollbar__track--vertical .fxs-scrollbar__thumb--vertical');
    if (!thumb) return [];
    // Native appends this help directly to its right details thumb and may
    // rewrite its inline display on every update. Own only that exact element;
    // our marker, footer entries, and other actions are never touched.
    return [...thumb.querySelectorAll('fxs-nav-help[action-key="inline-scroll-pan"],[data-name="NavHelp"][action-key="inline-scroll-pan"]')]
      .filter(el => el!==marker && !el.classList.contains('mtg-scroll-marker')
        && el.closest('.fxs-scrollbar__thumb--vertical')===thumb);
  }
  function suppressSaveLoadNativeHelps(host) {
    const wanted=new Set(saveLoadNativeHelps(host));
    for (const old of suppressedNativeHelps) {
      if (!wanted.has(old)) { old.classList.remove('mtg-suppressed-native-scroll-help'); suppressedNativeHelps.delete(old); }
    }
    for (const help of wanted) { help.classList.add('mtg-suppressed-native-scroll-help'); suppressedNativeHelps.add(help); }
  }
  function paint(list, a, scrollAction, host) {
    const tracks=new Set(list.map(area=>area.el.querySelector('.fxs-scrollbar__track--vertical,.scroll-area_track')).filter(Boolean));
    for (const old of ownedTracks) if (!tracks.has(old)) { old.classList.remove('mtg-owned-scroll-track'); ownedTracks.delete(old); }
    for (const track of tracks) { track.classList.add('mtg-owned-scroll-track'); ownedTracks.add(track); }
    const track=a?.el.querySelector('.fxs-scrollbar__track--vertical,.scroll-area_track');
    if (marked!==track) {
      marked?.classList.remove('mtg-active-scroll'); marked=track;
      marked?.classList.add('mtg-active-scroll');
    }
    // Keep the original selected-scrollbar glyph and suppress the duplicate
    // native decorations while this mod owns the same physical RS stream.
    const thumb=track?.querySelector('.fxs-scrollbar__thumb--vertical,.scroll-area_thumb');
    if (thumb) {
      if (!marker) {
        marker=document.createElement('fxs-nav-help');
        marker.className='mtg-scroll-marker trigger-nav-help';
        marker.setAttribute('action-key','inline-scroll-pan');
        marker.setAttribute('aria-hidden','true');
        marker.style.cssText='position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);pointer-events:none;z-index:2;';
      }
      if (marker.parentElement!==thumb) thumb.append(marker);
    } else { marker?.remove(); marker=null; }
    suppressSaveLoadNativeHelps(host);
    // The native persistent tray owns the footer presentation. Repeating sync
    // is safe: the adapter pushes each action at most once and withdraws only
    // its own entry when the active scope no longer needs it.
    navigationTray?.set(a ? [
      { action: 'shell-action-3', locKey: 'LOC_MTG_SCROLL_CENTER' },
      ...(list.length > 1 ? [{ action: 'scroll-pan', locKey: 'LOC_MTG_SCROLL_SWITCH' }] : [])
    ] : []);
  }
  function reset() {
    selected=null; scope=null; horizontal=false; pressed=false; armed=false; stopVertical(); last=now();
    marker?.remove();marker=null;
    for (const track of ownedTracks) track.classList.remove('mtg-owned-scroll-track');
    ownedTracks.clear();
    for (const help of suppressedNativeHelps) help.classList.remove('mtg-suppressed-native-scroll-help');
    suppressedNativeHelps.clear();
    navigationTray?.set([]);
    marked?.classList.remove('mtg-active-scroll'); marked=null;
  }
  function sync(active, scrollAction='scroll-pan') {
    if (!active) { reset(); return; }
    if (popupOwnsFrame()) return;
    const host=root(), list=areas(), a=choose(list), time=now();
    // Preserve real elapsed time for normal 16/33/100 ms frames. The stale-input
    // cutoff below remains the guard against a delayed frame causing a jump.
    const dt=Math.max(0,time-last); last=time;
    if (a && speed && time-sample<180) {
      const v=a.viewport, top=Math.max(0,Math.min(v.scrollHeight-v.clientHeight,v.scrollTop-speed*dt*.75*acceleration(v,time)));
      if (a.el.tagName==='FXS-SCROLLABLE') {
        a.el.component.currentScrollOnScrollAreaInPixels=top;
        a.el.component.setScrollThumbPosition();
      }
      else v.scrollTop=top; // Solid ScrollArea's native scroll event updates its thumb.
    } else stopVertical();
    paint(list,a,scrollAction,host);
  }
  function route(name,status,x,y,active,scrollAction) {
    if (!active) { sync(false); return false; }
    if ((name==='scroll-pan' || name==='shell-action-3') &&
        popupOwnsInput(name,status,x,y)) {
      reset(); return true;
    }
    sync(active,scrollAction);
    if (!active) return false;
    const list=areas(), a=choose(list);
    if (!a) return false;
    if (name==='shell-action-3') {
      if (status===S.START && !pressed) { pressed=true; center(a); }
      if (status===S.FINISH) pressed=false;
      return true;
    }
    if (name!=='scroll-pan') return false;
    if (status===S.FINISH || !Number.isFinite(x) || !Number.isFinite(y) || Math.hypot(x,y)<.25) {
      horizontal=false; armed=true; stopVertical(); return true;
    }
    if (![S.START,S.UPDATE,S.HOLD].includes(status)) return true;
    if (status===S.START) armed=true;
    if (!armed) return true; // A held input from the previous panel must return to neutral.
    // High threshold + dominant horizontal axis + return-to-centre latch.
    if (Math.abs(x)>=.75 && Math.abs(x)>=Math.abs(y)*2) {
      stopVertical();
      if (!horizontal && list.length>1) {
        const index=list.findIndex(item=>item.el===selected);
        selected=list[Math.max(0,Math.min(list.length-1,index+Math.sign(x)))].el;
      }
      horizontal=true;
    } else {
      setVertical(Math.abs(y)>.25 && Math.abs(y)>Math.abs(x)?y:0);
      // A vertical gesture cannot roll straight into a horizontal switch.
      if (Math.abs(y)>.25) horizontal=true;
    }
    sample=now(); paint(list,choose(list),scrollAction,root()); return true;
  }
  const style=document.createElement('style');
  style.textContent='.mtg-suppressed-native-scroll-help{display:none!important;opacity:0!important;visibility:hidden!important}.mtg-active-scroll{outline:2px solid #d7c58e;outline-offset:3px}';
  document.head.append(style);
  return { sync, route, suspend:reset, dispose(){reset();style.remove();} };
}
