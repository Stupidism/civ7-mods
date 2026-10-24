import { TOOL_DEFINITIONS } from './navigation.js';

// The native wheel's fxs-icon resolves an icon database ID. Minimap buttons
// instead use texture URLs, including DMT's own PNG. Reuse those exact images
// without sending texture names through the icon database lookup.
export function syncRadialIcons(root, menus, document, window) {
  for (const button of root.querySelectorAll('.radial-menu-item')) {
    const menu = menus[Number(button.getAttribute('menuIndex'))];
    if (menu?.title !== 'LOC_MTG_TITLE') continue;
    const item = menu.items[Number(button.getAttribute('index'))];
    const tool = TOOL_DEFINITIONS.find(candidate => candidate.title === item?.title);
    if (!tool) continue;
    const source = document.querySelector(tool.selector)?.querySelector(tool.iconSelector);
    const background = source && window.getComputedStyle(source).backgroundImage;
    const image = background && background !== 'none' ? background : tool.icon;
    let icon = button.querySelector('.mtg-radial-tool-icon');
    if (!icon) {
      const original = button.querySelector('fxs-icon');
      if (!original) continue;
      icon = document.createElement('div');
      icon.className = 'relative mtg-radial-tool-icon';
      icon.style.cssText = 'width:2.5rem;height:2.5rem;background-size:contain;background-position:center;background-repeat:no-repeat;pointer-events:none;';
      button.replaceChild(icon, original);
    }
    icon.style.backgroundImage = image;
  }
}
