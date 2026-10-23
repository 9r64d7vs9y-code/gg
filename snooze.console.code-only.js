(() => {
  const shown = node => { const s = getComputedStyle(node); return s.display !== 'none' && s.visibility !== 'hidden' && node.getClientRects().length > 0; };
  const cls = node => node ? `${node.tagName.toLowerCase()}${node.id ? '#' + node.id : ''}.${[...node.classList].join('.')}`.replace(/\d+/g, '#') : null;
  const chain = node => { const out = []; for (let n = node.parentElement; n && n !== document.body && out.length < 8; n = n.parentElement) out.push(cls(n)); return out; };
  const views = [...document.querySelectorAll('.fc-view')].filter(shown);
  console.log(JSON.stringify({
    staffWrappers: [...document.querySelectorAll('.staff-calendar-wrapper')].map(n => ({ shown: shown(n), class: cls(n) })),
    tabPanes: [...document.querySelectorAll('.tab-pane')].map(n => ({ active: n.classList.contains('active'), shown: shown(n), class: cls(n) })),
    views: views.map(v => ({
      class: cls(v),
      datedCells: v.querySelectorAll('td.fc-day[data-date]').length,
      datedCellsShown: [...v.querySelectorAll('td.fc-day[data-date]')].filter(shown).length,
      anyDated: v.querySelectorAll('[data-date]').length,
      entries: v.querySelectorAll('.fc-event, a.fc-timeline-event, .fc-timeline-event').length,
      size: `${Math.round(v.getBoundingClientRect().width)}x${Math.round(v.getBoundingClientRect().height)}`,
      parents: chain(v),
    })),
  }, null, 1));
})();
