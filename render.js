/* IGRObeauty — каталог: рендер страниц + рабочая фильтрация по данным справочника */
(function () {
  'use strict';
  var D = window.IG_DATA;
  var PER_PAGE = 24;

  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function ic(name, size) { return '<i class="ig-ic ig-ic--' + name + ' ig-ic-' + size + '" aria-hidden="true"></i>'; }
  function NUM(n) { return n.toLocaleString('ru-RU'); }
  function plural(n, f) { var a = Math.abs(n) % 100, b = a % 10; if (a > 10 && a < 20) return f[2]; if (b > 1 && b < 5) return f[1]; if (b === 1) return f[0]; return f[2]; }
  function goods(n) { return NUM(n) + ' ' + plural(n, ['товар', 'товара', 'товаров']); }
  function rub(n) { return NUM(n) + ' ₽'; }
  function priceLabel(p) { return p.r ? rub(p.r) : 'Цена по запросу'; }

  var params = new URLSearchParams(location.search);
  /* неизвестный id не должен ронять страницу — падаем на раздел по умолчанию */
  var node = D.nodes[params.get('id')] || D.nodes[document.body.getAttribute('data-default')] || D.nodes.index;
  document.title = node.docTitle;

  /* ---------- выборка раздела ----------
     поле может быть многозначным (t — до трёх привязок к подкатегориям);
     товар попадает в раздел, если значение есть в любом из полей, но в списке показывается один раз */
  function vals(p, k) { var v = p[k]; return !v ? [] : (typeof v === 'string' ? [v] : v); }
  function has(p, k, v) { return vals(p, k).indexOf(v) > -1; }
  var sc = node.scope;
  var scope = D.items.filter(function (p) {
    return p.d === sc.d && (!sc.p || has(p, 'p', sc.p)) && (!sc.t || has(p, 't', sc.t));
  });

  var FACETS = [
    { k: 'g', title: 'Бренд', open: true },
    { k: 'c', title: 'Страна бренда' },
    { k: 'l', title: 'Продуктовая линия', min: 2 },
    { k: 'y', title: 'Тип продукта' },
    { k: 'e', title: 'Действие / эффект' },
    { k: 't', title: 'Технология / задача', min: 2 },
    { k: 's', title: 'Линия / серия' }
  ];
  /* порядок панели по направлениям; не перечисленные фасеты идут в конце в порядке FACETS */
  var FACET_ORDER = {
    cosm: ['g', 'c', 't', 'l', 'e', 'y'],
    hair: ['g', 'c', 'l', 's', 't', 'y']
  };
  /* быстрые фильтры: level — только на этом уровне, minLevel — от этого уровня и глубже */
  var QF_ROWS = [
    { k: 'e', label: 'Действие / эффект:', level: 3 },
    { k: 'y', label: 'Тип продукта:', minLevel: 2 }
  ];

  function distinct(items, k) {
    var seen = {}, n = 0;
    items.forEach(function (p) { vals(p, k).forEach(function (v) { if (!seen[v]) { seen[v] = 1; n++; } }); });
    if (k === 't' && sc.t && seen[sc.t]) n--;   /* текущая подкатегория — не выбор */
    return n;
  }
  function valuesOf(k) {
    var m = {}; scope.forEach(function (p) { vals(p, k).forEach(function (v) { m[v] = (m[v] || 0) + 1; }); });
    if (k === 't' && sc.t) delete m[sc.t];
    return Object.keys(m).sort(function (a, b) { return m[b] - m[a] || a.localeCompare(b, 'ru'); });
  }

  /* список линий — только на разделах: 3-й уровень и 2-й без подразделов */
  var hasChildren = !!(node.dirs && node.dirs.length && /section\.html/.test(node.dirs[0].href || ''));
  /* flat — аналитические категории: сразу товары, без карточек и переключателя линий */
  var hasLines = !node.flat && distinct(scope, 'l') >= 2 && (node.level === 3 || (node.level === 2 && !hasChildren));
  var facets = FACETS.filter(function (f) { return distinct(scope, f.k) >= (f.min || 1); });
  (function () {
    var ord = FACET_ORDER[node.cat]; if (!ord) return;
    facets.sort(function (a, b) {
      var ia = ord.indexOf(a.k), ib = ord.indexOf(b.k);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
  })();
  var brandChips = (function () {
    if (distinct(scope, 'g') < 2) return [];
    var keys = valuesOf('k');
    return (keys.length ? keys : valuesOf('g')).slice(0, 4);
  })();
  var qfRows = QF_ROWS.filter(function (r) {
    return (!r.level || node.level === r.level) && (!r.minLevel || node.level >= r.minLevel) && distinct(scope, r.k) >= 2;
  });

  /* ---------- состояние ---------- */
  var sel = {}, pending = null, expanded = {}, openFacets = {};
  FACETS.forEach(function (f) { sel[f.k] = []; if (f.open) openFacets[f.k] = true; });
  var state = { sort: 'asc', view: hasLines ? 'list' : 'tiles', page: 1 };
  /* ?line=… — переход из мега-меню сразу в линию с применённым фильтром */
  var deepLine = params.get('line');
  if (deepLine && valuesOf('l').indexOf(deepLine) > -1) { sel.l = [deepLine]; state.view = 'tiles'; }

  function clone(s) { var o = {}; for (var k in s) o[k] = s[k].slice(); return o; }
  function totalSelected(s) { var n = 0; for (var k in s) n += s[k].length; return n; }
  function anySelected(s) { return totalSelected(s) > 0; }
  function matches(p, s, skip) {
    for (var k in s) {
      if (k === skip) continue;
      var v = s[k]; if (!v.length) continue;
      var pv = vals(p, k), hit = false;
      for (var i = 0; i < v.length; i++) if (pv.indexOf(v[i]) > -1) { hit = true; break; }
      if (!hit) return false;
    }
    return true;
  }
  function filtered(s, skip) { return scope.filter(function (p) { return matches(p, s, skip); }); }
  /* счётчик = сколько останется, если добавить это значение (свой фильтр не учитываем) */
  function countsFor(s, k) {
    var m = {};
    filtered(s, k).forEach(function (p) { vals(p, k).forEach(function (v) { m[v] = (m[v] || 0) + 1; }); });
    return m;
  }
  function sortItems(list) {
    var dir = state.sort === 'desc' ? -1 : 1;
    return list.slice().sort(function (a, b) {
      if (!a.r !== !b.r) return a.r ? -1 : 1;
      if (a.r !== b.r) return (a.r - b.r) * dir;
      return a.n.localeCompare(b.n, 'ru');
    });
  }
  function lineGroups(items) {
    var m = {}, order = [];
    items.forEach(function (p) { if (!p.l) return; if (!m[p.l]) { m[p.l] = []; order.push(p.l); } m[p.l].push(p); });
    return order.map(function (name) {
      var list = m[name], cnt = {}, cty = {}, min = Infinity;
      list.forEach(function (p) { cnt[p.g] = (cnt[p.g] || 0) + 1; if (p.c) cty[p.c] = (cty[p.c] || 0) + 1; if (p.r && p.r < min) min = p.r; });
      var top = function (o) { return Object.keys(o).sort(function (a, b) { return o[b] - o[a]; })[0] || ''; };
      return { name: name, brand: top(cnt), country: top(cty), n: list.length, min: min };
    }).sort(function (a, b) { return b.n - a.n || a.name.localeCompare(b.name, 'ru'); });
  }

  /* ---------- мега-меню ---------- */
  var megaEl = document.getElementById('mega');
  if (megaEl) {
    megaEl.innerHTML = '<div class="ig-container ig-mega__inner"><div class="ig-mega__cats">' +
      D.mega.cats.map(function (c) {
        if (c.off) return '<button class="ig-mega__cat is-off" data-cat="' + c.cat + '">' + esc(c.t) + '</button>';
        return '<a class="ig-mega__cat' + (c.cat === node.cat ? ' is-active' : '') + '" data-cat="' + c.cat + '" href="' + c.href + '">' + esc(c.t) + '</a>';
      }).join('') + '</div>' +
      D.mega.panels.map(function (p) {
        return '<div class="ig-mega__cols" data-panel="' + p.cat + '"' + (p.cat === node.cat ? '' : ' hidden') + '>' +
          p.cols.map(function (col) {
            return '<div>' + col.map(function (g) {
              return '<div class="ig-mega__group"><h3 class="ig-mega__group-title"><a href="' + g.href + '">' + esc(g.title) + '</a></h3><ul class="ig-mega__links">' +
                g.links.map(function (l) { return '<li><a href="' + l.href + '">' + esc(l.t) + '</a></li>'; }).join('') + '</ul></div>';
            }).join('') + '</div>';
          }).join('') + '</div>';
      }).join('') + '</div>';
  }

  /* ---------- статика страницы ---------- */
  var crumbs = node.crumbs.map(function (c, i) {
    return i === node.crumbs.length - 1
      ? '<span aria-current="page">' + esc(c.t) + '</span>'
      : '<a href="' + (c.href || '#') + '">' + esc(c.t) + '</a>';
  }).join('<span class="ig-breadcrumb__sep">/</span>');
  var html = '<section class="ig-hero ig-hero--band"><div class="ig-container">' +
    '<nav class="ig-breadcrumb" aria-label="Хлебные крошки">' + crumbs + '</nav>' +
    '<h1 class="ig-hero__title">' + esc(node.title) + '</h1>' +
    '</div></section>';
  if (node.dirs && node.dirs.length) {
    html += '<section class="ig-directions"><div class="ig-container ig-directions__wrap">' +
      '<button class="ig-directions__arrow ig-directions__arrow--left" data-scroll="-1" aria-label="Предыдущие" hidden>' + ic('arrow-left', 20) + '</button>' +
      '<div class="ig-directions__track">' +
      node.dirs.map(function (d) {
        var cls = 'ig-direction' + (d.active ? ' is-active' : '');
        var inner = '<span class="ig-direction__dot"></span>' +
          (d.n ? '<span class="ig-direction__t">' + esc(d.t) + '</span><span class="ig-direction__n">' + esc(d.n) + '</span>' : esc(d.t));
        return '<a class="' + cls + '" href="' + (d.href || '#') + '">' + inner + '</a>';
      }).join('') +
      '</div><button class="ig-directions__arrow ig-directions__arrow--right" data-scroll="1" aria-label="Ещё">' + ic('arrow-right', 20) + '</button></div></section>';
  }
  html += '<section class="ig-toolbar"><div class="ig-container">' +
    '<div class="ig-toolbar__row" id="ig-tb"></div><div id="ig-qf"></div></div></section>' +
    '<main class="ig-content"><div class="ig-container" id="ig-content"></div></main>';
  document.getElementById('page').innerHTML = html;

  /* ---------- тулбар ---------- */
  function renderToolbar() {
    var total = filtered(sel).length;
    var n = totalSelected(sel);
    var left = '<button class="ig-btn ig-btn--outline' + (n ? ' is-active' : '') + '" data-open="filters">' +
      ic('filter', 18) + ' Фильтры' + (n ? ' · ' + n : '') + '</button>';

    if (brandChips.length) {
      var bc = countsFor(sel, 'g');
      left += '<button class="ig-chip ' + (sel.g.length ? 'ig-chip--ghost' : 'ig-chip--solid') + '" data-all-brands>Все бренды</button>';
      brandChips.forEach(function (b) {
        var on = sel.g.indexOf(b) > -1, cnt = bc[b] || 0;
        if (!cnt && !on) return;
        left += '<button class="ig-chip ' + (on ? 'ig-chip--ghost is-active' : 'ig-chip--ghost') + '" data-facet="g" data-val="' + esc(b) + '">' +
          esc(b) + ' <span class="ig-chip__count">' + NUM(cnt) + '</span></button>';
      });
    }
    if (hasLines) {
      var ln = sel.l.length;
      left += '<button class="ig-chip ig-chip--dashed' + (ln ? ' is-active' : '') + '" data-open="lines">Продуктовые линии' +
        (ln ? ' · ' + ln + ' из ' + distinct(scope, 'l') : ' · ' + distinct(scope, 'l')) + ' ' + ic('chevron', 14) + '</button>';
    }

    var sortLabel = state.sort === 'asc' ? 'Цена: по возрастанию' : 'Цена: по убыванию';
    var right = '<span class="ig-count">' + goods(total) + '</span>' +
      '<div class="ig-sortwrap"><button class="ig-sort" data-sortmenu>' + esc(sortLabel) + ' ' + ic('chevron', 14) + '</button>' +
      '<div class="ig-sortmenu" hidden>' +
      '<button class="ig-sortmenu__item' + (state.sort === 'asc' ? ' is-active' : '') + '" data-sort="asc">Цена: по возрастанию</button>' +
      '<button class="ig-sortmenu__item' + (state.sort === 'desc' ? ' is-active' : '') + '" data-sort="desc">Цена: по убыванию</button>' +
      '</div></div>' +
      (hasLines ? '<div class="ig-segmented" data-viewtoggle>' +
        '<button class="ig-segmented__btn' + (state.view === 'list' ? ' is-active' : '') + '" data-view="list">Список линий</button>' +
        '<button class="ig-segmented__btn' + (state.view === 'tiles' ? ' is-active' : '') + '" data-view="tiles">Список товаров</button></div>' : '');

    document.getElementById('ig-tb').innerHTML =
      '<div class="ig-toolbar__left">' + left + '</div><div class="ig-toolbar__right">' + right + '</div>';

    /* быстрые фильтры: значения с 0 скрываем, выбранное — никогда */
    var qf = qfRows.map(function (row) {
      var cnts = countsFor(sel, row.k), picked = sel[row.k];
      var vals = valuesOf(row.k).filter(function (v) { return (cnts[v] || 0) > 0 || picked.indexOf(v) > -1; })
        .sort(function (a, b) { return (cnts[b] || 0) - (cnts[a] || 0) || a.localeCompare(b, 'ru'); });
      var shown = vals.slice(0, 8);
      picked.forEach(function (v) { if (shown.indexOf(v) < 0) shown.push(v); });   /* выбранное видно всегда */
      var chips = shown.map(function (v) {
        var on = picked.indexOf(v) > -1, c = cnts[v] || 0;
        return '<button class="ig-chip ig-chip--ghost' + (on ? ' is-active' : '') + '" data-facet="' + row.k + '" data-val="' + esc(v) + '">' +
          esc(v) + ' <span class="ig-chip__count">' + NUM(c) + '</span></button>';
      }).join('');
      if (!chips) return '';
      return '<div class="ig-qf__row"><span class="ig-qf__label">' + esc(row.label) + '</span><div class="ig-qf__chips">' + chips + '</div></div>';
    }).join('');
    document.getElementById('ig-qf').innerHTML = qf ? '<div class="ig-qf">' + qf + '</div>' : '';
  }

  /* ---------- контент ---------- */
  function cardHTML(p) {
    return '<article class="ig-card">' +
      '<div class="ig-card__media ig-card__media--ph" aria-hidden="true"></div>' +
      '<div class="ig-card__body">' +
      '<div class="ig-card__brand">' + esc((p.g || '').toUpperCase()) + '</div>' +
      '<div class="ig-card__name" title="' + esc(p.n) + '">' + esc(p.n) + '</div>' +
      (p.l ? '<div class="ig-card__line" title="' + esc(p.l) + '">' + esc(p.l) + '</div>' : '') +
      '<div class="ig-card__art"><span>Арт. ' + esc(p.a) + '</span></div>' +
      '<div class="ig-card__foot"><span class="ig-card__price">' + esc(priceLabel(p)) + '</span>' +
      '<button class="ig-btn ig-btn--primary">В корзину</button></div>' +
      '</div></article>';
  }
  function lineCardHTML(l) {
    return '<a class="ig-linecard" href="#" data-line="' + esc(l.name) + '">' +
      '<div class="ig-linecard__top"><div><div class="ig-linecard__brand">' +
      esc([l.brand, l.country].filter(Boolean).join(' · ').toUpperCase()) + '</div>' +
      '<div class="ig-linecard__name">' + esc(l.name) + '</div></div>' +
      '<span class="ig-linecard__arrow">' + ic('arrow-right', 20) + '</span></div>' +
      '<div class="ig-linecard__swatches" aria-hidden="true">' +
      [0, 1, 2, 3].map(function () { return '<div class="ig-linecard__swatch"></div>'; }).join('') + '</div>' +
      '<div class="ig-linecard__foot"><span>' + goods(l.n) + '</span>' +
      '<span class="ig-linecard__price">' + (isFinite(l.min) ? 'от ' + rub(l.min) : '') + '</span></div></a>';
  }
  function pagerHTML(pages) {
    if (pages < 2) return '';
    var cur = state.page, out = [];
    function num(i) { return '<button class="ig-pager__num' + (i === cur ? ' is-active' : '') + '" data-page="' + i + '">' + i + '</button>'; }
    var show = {};
    [1, pages, cur - 1, cur, cur + 1].forEach(function (i) { if (i >= 1 && i <= pages) show[i] = 1; });
    var prev = 0;
    Object.keys(show).map(Number).sort(function (a, b) { return a - b; }).forEach(function (i) {
      if (prev && i - prev > 1) out.push('<span class="ig-pager__gap">…</span>');
      out.push(num(i)); prev = i;
    });
    return '<nav class="ig-pager" aria-label="Страницы">' +
      '<button class="ig-pager__btn" data-page="' + (cur - 1) + '"' + (cur === 1 ? ' disabled' : '') + ' aria-label="Назад">' + ic('arrow-left', 18) + '</button>' +
      out.join('') +
      '<button class="ig-pager__btn" data-page="' + (cur + 1) + '"' + (cur === pages ? ' disabled' : '') + ' aria-label="Вперёд">' + ic('arrow-right', 18) + '</button></nav>';
  }
  function renderContent() {
    var el = document.getElementById('ig-content');
    if (state.view === 'list' && hasLines && !anySelected(sel)) {
      el.innerHTML = '<div class="ig-lines">' + lineGroups(scope).map(lineCardHTML).join('') + '</div>';
      return;
    }
    var list = sortItems(filtered(sel));
    if (!list.length) {
      el.innerHTML = '<div class="ig-empty ig-empty--block">' +
        '<div class="ig-empty__title">Ничего не найдено</div>' +
        '<p class="ig-empty__text">По выбранным фильтрам в разделе нет товаров. Снимите часть условий.</p>' +
        '<button class="ig-btn ig-btn--dark ig-btn--lg" data-reset-all>Сбросить фильтры</button></div>';
      return;
    }
    var pages = Math.ceil(list.length / PER_PAGE);
    if (state.page > pages) state.page = pages;
    var start = (state.page - 1) * PER_PAGE;
    el.innerHTML = '<div class="ig-grid">' + list.slice(start, start + PER_PAGE).map(cardHTML).join('') + '</div>' + pagerHTML(pages);
  }

  /* ---------- панель «Фильтры» ---------- */
  function renderFilters() {
    var body = document.querySelector('#drawer-filters .ig-drawer__body');
    if (!body) return;
    var s = pending || sel;
    body.innerHTML = facets.map(function (f) {
      var cnts = countsFor(s, f.k), picked = s[f.k];
      var vals = valuesOf(f.k).slice().sort(function (a, b) {
        var ca = cnts[a] || 0, cb = cnts[b] || 0;
        if (!ca !== !cb) return ca ? -1 : 1;          /* нулевые — в конец */
        return 0;
      });
      var limit = expanded[f.k] ? vals.length : 8;
      if (openFacets[f.k] === undefined && picked.length > 0) openFacets[f.k] = true;
      var open = !!openFacets[f.k];
      var rows = vals.slice(0, limit).map(function (v) {
        var on = picked.indexOf(v) > -1, c = cnts[v] || 0;
        var cls = 'ig-check' + (on ? ' is-on' : '') + (!c && !on ? ' is-off' : '');
        return '<label class="' + cls + '" data-facet="' + f.k + '" data-val="' + esc(v) + '">' +
          '<span class="ig-check__box">' + ic('check', 14) + '</span>' +
          '<span class="ig-check__label">' + esc(v) + '</span>' +
          '<span class="ig-check__count">' + NUM(c) + '</span></label>';
      }).join('');
      var rest = vals.length - limit;
      return '<div class="ig-facc' + (open ? ' is-open' : '') + '" data-facet-group="' + f.k + '">' +
        '<button class="ig-facc__head">' + esc(f.title) + ' <span class="ig-facc__sign">' + (open ? '−' : '+') + '</span></button>' +
        '<div class="ig-facc__body">' + rows +
        (rest > 0 ? '<button class="ig-morelink" data-expand="' + f.k + '">Ещё ' + rest + ' ' + plural(rest, ['значение', 'значения', 'значений']) + '</button>' : '') +
        '</div></div>';
    }).join('');
    var foot = document.querySelector('#drawer-filters .ig-drawer__foot .ig-btn--dark');
    if (foot) foot.textContent = 'Показать ' + goods(filtered(s).length);
    var reset = document.querySelector('#drawer-filters .ig-drawer__foot [data-close]');
    if (reset) reset.disabled = !anySelected(s);
  }

  /* ---------- панель «Продуктовые линии» ---------- */
  function renderLinesDrawer() {
    var body = document.querySelector('#drawer-lines .ig-drawer__body');
    if (!body) return;
    var s = pending || sel, cnts = countsFor(s, 'l'), picked = s.l;
    var vals = valuesOf('l').slice().sort(function (a, b) {
      var ca = cnts[a] || 0, cb = cnts[b] || 0;
      if (!ca !== !cb) return ca ? -1 : 1;
      return 0;
    });
    body.innerHTML = vals.map(function (v) {
      var on = picked.indexOf(v) > -1, c = cnts[v] || 0;
      var groups = lineGroups(scope.filter(function (p) { return p.l === v; }))[0] || { brand: '' };
      return '<div class="ig-lineitem' + (on ? ' is-selected' : '') + (!c && !on ? ' is-off' : '') + '" data-facet="l" data-val="' + esc(v) + '">' +
        '<span class="ig-lineitem__box">' + ic('check', 14) + '</span>' +
        '<div><div class="ig-lineitem__brand">' + esc((groups.brand || '').toUpperCase()) + '</div>' +
        '<div class="ig-lineitem__name">' + esc(v) + '</div></div>' +
        '<span class="ig-lineitem__count">' + NUM(c) + '</span></div>';
    }).join('');
    var foot = document.querySelector('#drawer-lines .ig-drawer__foot .ig-btn--dark');
    if (foot) foot.textContent = picked.length ? 'Показать · выбрано ' + picked.length : 'Показать ' + goods(filtered(s).length);
    var reset = document.querySelector('#drawer-lines .ig-drawer__foot [data-close]');
    if (reset) reset.disabled = picked.length === 0;
  }

  function renderAll() { renderToolbar(); renderContent(); renderFilters(); renderLinesDrawer(); }

  /* ---------- взаимодействие ---------- */
  function toggle(arr, v) { var i = arr.indexOf(v); if (i > -1) arr.splice(i, 1); else arr.push(v); }
  function afterFilterChange() {
    state.page = 1;
    if (anySelected(sel)) state.view = 'tiles';
    renderAll();
  }
  function scrollToGrid() {
    var grid = document.querySelector('.ig-grid');
    var toolbar = document.querySelector('.ig-toolbar');
    if (!grid || !toolbar) return;
    var y = toolbar.getBoundingClientRect().top + window.pageYOffset - 12;
    window.scrollTo({ top: y, behavior: 'smooth' });
  }

  document.addEventListener('click', function (e) {
    var t = e.target;

    /* быстрые фильтры — применяются сразу */
    var chip = t.closest('.ig-toolbar [data-facet]');
    if (chip) { toggle(sel[chip.getAttribute('data-facet')], chip.getAttribute('data-val')); afterFilterChange(); return; }
    if (t.closest('[data-all-brands]')) { sel.g = []; afterFilterChange(); return; }

    /* открытие панелей: правим копию состояния */
    var opener = t.closest('[data-open]');
    if (opener) { pending = clone(sel); renderFilters(); renderLinesDrawer(); return; }

    /* панель: галочки и линии */
    var row = t.closest('.ig-drawer [data-facet]');
    if (row) {
      e.preventDefault();
      if (row.classList.contains('is-off')) return;
      if (!pending) pending = clone(sel);
      toggle(pending[row.getAttribute('data-facet')], row.getAttribute('data-val'));
      renderFilters(); renderLinesDrawer();
      return;
    }
    /* раскрытие групп фильтров живёт в состоянии, иначе оно терялось бы на каждой галочке */
    var accHead = t.closest('.ig-drawer .ig-facc__head');
    if (accHead) {
      var key = accHead.parentNode.getAttribute('data-facet-group');
      openFacets[key] = !openFacets[key];
      renderFilters();
      return;
    }
    var expand = t.closest('[data-expand]');
    if (expand) { var ek = expand.getAttribute('data-expand'); expanded[ek] = true; openFacets[ek] = true; renderFilters(); return; }

    /* «Показать» — применяем; «Сбросить» — очищаем выбор в панели */
    var apply = t.closest('.ig-drawer__foot .ig-btn--dark');
    if (apply) { sel = pending ? clone(pending) : sel; pending = null; afterFilterChange(); return; }
    var reset = t.closest('.ig-drawer__foot [data-close]');
    if (reset) { pending = {}; FACETS.forEach(function (f) { pending[f.k] = []; }); renderFilters(); renderLinesDrawer(); return; }

    if (t.closest('[data-reset-all]')) {
      FACETS.forEach(function (f) { sel[f.k] = []; });
      pending = null; state.view = hasLines ? 'list' : 'tiles';
      afterFilterChange(); return;
    }

    /* сортировка */
    var sortBtn = t.closest('[data-sortmenu]');
    if (sortBtn) {
      var menu = sortBtn.parentNode.querySelector('.ig-sortmenu');
      menu.hidden = !menu.hidden;
      return;
    }
    var sortItem = t.closest('[data-sort]');
    if (sortItem) { state.sort = sortItem.getAttribute('data-sort'); state.page = 1; renderAll(); return; }
    document.querySelectorAll('.ig-sortmenu').forEach(function (m) { if (!t.closest('.ig-sortwrap')) m.hidden = true; });

    /* переключение вида: список линий сбрасывает фильтры */
    var vb = t.closest('[data-view]');
    if (vb) {
      state.view = vb.getAttribute('data-view');
      if (state.view === 'list') { FACETS.forEach(function (f) { sel[f.k] = []; }); pending = null; }
      state.page = 1; renderAll();
      return;
    }

    /* карточка линии → фильтр по этой линии */
    var lineCard = t.closest('.ig-linecard');
    if (lineCard) {
      e.preventDefault();
      sel.l = [lineCard.getAttribute('data-line')];
      state.view = 'tiles'; state.page = 1; renderAll();
      return;
    }

    /* страницы */
    var pg = t.closest('[data-page]');
    if (pg && !pg.disabled) {
      state.page = parseInt(pg.getAttribute('data-page'), 10) || 1;
      renderContent(); scrollToGrid();
      return;
    }
  });

  renderAll();
})();
