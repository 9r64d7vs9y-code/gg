[...document.querySelectorAll('select')].map(s => [s.id, s.name, s.dataset.columnName, s.dataset.placeholder].join(' | ')).join('\n')
