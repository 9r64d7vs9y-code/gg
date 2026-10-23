/*
 * Snooze Tax periods check — read-only (Claude, 2026-10-23).
 * Paste into the console on Tax MySource > Schedule > Calendar view with the
 * test person's schedule open. It clicks nothing and changes nothing; it
 * prints only fixed words, counts and class names, never page text.
 * Run it twice: once with the menu closed, once after you open the settings
 * menu yourself (leave it open while it runs).
 */
(() => {
  const shown = node => { const s = getComputedStyle(node); return s.display !== 'none' && s.visibility !== 'hidden' && node.getClientRects().length > 0; };
  const cls = node => `${node.tagName.toLowerCase()}.${[...node.classList].join('.')}`.replace(/\d+/g, '#');
  const tidy = t => String(t).replace(/\s+/g, ' ').trim();
  const settings = [...document.querySelectorAll('button.fc-settings-button')];
  const views = [...document.querySelectorAll('.fc-view')].filter(shown);
  const items = [...document.querySelectorAll('.dropdown-menu a, .dropdown-menu button, .dropdown-menu li, .dropdown-item')].filter(shown);
  const loading = [...document.querySelectorAll('.loading, div.loading, .blockUI, .modal-backdrop')].filter(shown);
  const modals = [...document.querySelectorAll('.modal')].filter(shown);
  console.log(JSON.stringify({
    settingsButtons: settings.map(b => ({ shown: shown(b), labelLength: tidy(b.textContent).length, class: cls(b), open: b.getAttribute('aria-expanded') })),
    shownViews: views.map(cls),
    menuItemsShown: items.length,
    menuItemNoOfPeriods: items.filter(n => tidy(n.textContent) === 'No. of Periods').map(cls),
    menuItemsLike: items.filter(n => /period/i.test(n.textContent)).map(n => ({ class: cls(n), length: tidy(n.textContent).length })),
    coversShown: loading.map(cls),
    windowsShown: modals.map(cls),
  }, null, 1));
})();
