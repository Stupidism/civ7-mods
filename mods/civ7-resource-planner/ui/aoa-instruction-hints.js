// Native NavHelp owns device/layout changes; these are visual hints, not bindings.
import '/core/ui/components/fxs-nav-help.js';
export function setInstruction(element, key, action, { singleLine = false } = {}) {
  const value=Locale.compose(key), signature=`${action||''}:${value}:${singleLine}`;
  if(element.__aoaInstruction===signature)return;
  element.__aoaInstruction=signature;
  element.textContent='';
  // Native NavHelp is hidden until its owner explicitly opts into display.
  element.classList.add('trigger-nav-help');
  element.style.display='flex';element.style.flexDirection='row';element.style.alignItems='center';element.style.flexWrap='nowrap';
  if(action){const glyph=document.createElement('fxs-nav-help');glyph.setAttribute('action-key',`inline-${action}`);glyph.setAttribute('aria-hidden','true');glyph.style.marginRight='0.25rem';glyph.style.flexShrink='0';element.append(glyph);}
  const label=document.createElement('span');label.className='font-body';label.style.display='flex';label.style.minWidth='0';label.style.flex='1 1 0';if(singleLine){label.style.display='block';label.style.whiteSpace='nowrap';label.style.flex='0 0 auto';label.style.fontSize='24px';}
  label.innerHTML=Locale.stylize(key);element.append(label);
}
export function setRichText(element, key) {
  const html=Locale.stylize(key);if(element.innerHTML!==html)element.innerHTML=html;
}
