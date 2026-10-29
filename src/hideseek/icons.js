import { t } from '../i18n.js';

// Small inline icons for the Fantasy categories, drawn on a 24 x 24 grid in
// the category's color.

const PATHS = {
  Mage: '<path d="M12 2l2.3 7.7L22 12l-7.7 2.3L12 22l-2.3-7.7L2 12l7.7-2.3z"/>',
  Assassin: '<path d="M12 1.5l2.2 4.5v8.5H9.8V6z"/><path d="M6.5 14.5h11v2.2h-11z"/><path d="M10.9 16.7h2.2v5.8h-2.2z"/>',
  Fighter: '<path d="M10.8 2h2.4v20h-2.4z"/><path d="M13.2 4c4.8.3 7.3 3 7.3 6.5s-2.5 6.2-7.3 6.5z"/>',
  Tank: '<path d="M12 2l8.5 3.2v6.3c0 5.2-3.6 9.1-8.5 10.9-4.9-1.8-8.5-5.7-8.5-10.9V5.2z"/>',
  Marksman: '<path fill-rule="evenodd" d="M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18zm0 2.6a6.4 6.4 0 1 0 0 12.8 6.4 6.4 0 0 0 0-12.8z"/><circle cx="12" cy="12" r="2.6"/>',
  Support: '<path d="M12 21.3l-1.4-1.3C5.4 15.4 2 12.3 2 8.5 2 5.4 4.4 3 7.5 3c1.7 0 3.4.8 4.5 2.1C13.1 3.8 14.8 3 16.5 3 19.6 3 22 5.4 22 8.5c0 3.8-3.4 6.9-8.6 11.5z"/>',
};

export const CATEGORY_COLOR = {
  Mage: '#b48cff', Assassin: '#e8679f', Fighter: '#ff9a4a', Tank: '#9ab8cc', Marksman: '#ffd34d', Support: '#5fd3a0',
};

// A round badge with the category's icon, or '' for no category.
export function categoryIcon(category, cls = '') {
  if (!PATHS[category]) return '';
  return `<span class="cls ${cls}" style="--cls:${CATEGORY_COLOR[category]}" title="${t('cat.' + category)}">`
    + `<svg viewBox="0 0 24 24" aria-hidden="true">${PATHS[category]}</svg></span>`;
}
