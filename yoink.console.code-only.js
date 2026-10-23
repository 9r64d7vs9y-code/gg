[...document.querySelectorAll('a,button,[role=button]')].filter(n=>/search\s*again/i.test(n.textContent)).map(n=>n.outerHTML.slice(0,200))

location.pathname
