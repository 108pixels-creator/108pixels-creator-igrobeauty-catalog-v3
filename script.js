/* IGRObeauty — общая интерактивность каталога (фильтры живут в render.js) */
(function () {
  'use strict';
  var body = document.body;

  function openDrawer(id) {
    var d = document.getElementById(id);
    var scrim = document.querySelector('.ig-scrim');
    if (!d) return;
    d.classList.add('is-open');
    d.setAttribute('aria-hidden', 'false');
    if (scrim) scrim.classList.add('is-open');
    body.style.overflow = 'hidden';
  }
  function closeAll() {
    document.querySelectorAll('.ig-drawer.is-open').forEach(function (d) {
      d.classList.remove('is-open');
      d.setAttribute('aria-hidden', 'true');
    });
    var scrim = document.querySelector('.ig-scrim');
    if (scrim) scrim.classList.remove('is-open');
    body.style.overflow = '';
  }

  document.addEventListener('click', function (e) {
    var t = e.target;

    var openBtn = t.closest('[data-open]');
    if (openBtn) { openDrawer('drawer-' + openBtn.getAttribute('data-open')); return; }

    /* «Показать» закрывает панель, «Сбросить» — нет (только очищает выбор) */
    if (t.closest('.ig-drawer__foot .ig-btn--dark')) { closeAll(); return; }
    if (t.closest('.ig-drawer__foot [data-close]')) return;
    if (t.closest('[data-close]')) { closeAll(); return; }

    /* мега-меню */
    var megaBtn = t.closest('[data-toggle="mega"]');
    var mega = document.getElementById('mega');
    if (megaBtn && mega) {
      var open = mega.classList.toggle('is-open');
      megaBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
      mega.setAttribute('aria-hidden', open ? 'false' : 'true');
      return;
    }
    if (mega && mega.classList.contains('is-open') && !t.closest('#mega') && !t.closest('[data-toggle="mega"]')) {
      mega.classList.remove('is-open');
      var mb = document.querySelector('[data-toggle="mega"]');
      if (mb) mb.setAttribute('aria-expanded', 'false');
    }
    var catBtn = t.closest('.ig-mega__cat');
    if (catBtn) { showMegaPanel(catBtn); return; }

    /* «В корзину» → степпер */
    var addBtn = t.closest('.ig-card__foot .ig-btn--primary');
    if (addBtn) {
      var st = document.createElement('div');
      st.className = 'ig-stepper';
      st.innerHTML = '<button data-step="-1" aria-label="Меньше">−</button>' +
                     '<span class="ig-stepper__val">1</span>' +
                     '<button data-step="1" aria-label="Больше">+</button>';
      addBtn.replaceWith(st);
      updatePrice(st.parentNode, 1);
      return;
    }
    var step = t.closest('[data-step]');
    if (step) {
      var stepper = step.parentNode;
      var val = stepper.querySelector('.ig-stepper__val');
      var n = parseInt(val.textContent, 10) + parseInt(step.getAttribute('data-step'), 10);
      var foot = stepper.parentNode;
      var inCard = foot && foot.classList.contains('ig-card__foot');
      if (n < 1 && inCard) {
        var b = document.createElement('button');
        b.className = 'ig-btn ig-btn--primary';
        b.textContent = 'В корзину';
        stepper.replaceWith(b);
        updatePrice(foot, 1);
      } else {
        val.textContent = Math.max(1, n);
        if (inCard) updatePrice(foot, Math.max(1, n));
      }
      return;
    }

    /* стрелки прокрутки направлений */
    var arr = t.closest('[data-scroll]');
    if (arr) {
      var wrap = arr.closest('.ig-directions__wrap');
      var track = wrap && wrap.querySelector('.ig-directions__track');
      if (track) track.scrollBy({ left: 320 * parseInt(arr.getAttribute('data-scroll') || '1', 10), behavior: 'smooth' });
      return;
    }
  });

  function parsePrice(txt) { return parseInt((txt || '').replace(/[^0-9]/g, ''), 10) || 0; }
  function fmtPrice(n) { return n.toLocaleString('ru-RU') + ' ₽'; }
  function updatePrice(foot, qty) {
    var pe = foot && foot.querySelector('.ig-card__price');
    if (!pe || !/\d/.test(pe.textContent)) return;   /* «Цена по запросу» не считаем */
    var unit = parseInt(pe.getAttribute('data-unit') || '', 10);
    if (!unit) { unit = parsePrice(pe.textContent); pe.setAttribute('data-unit', unit); }
    pe.textContent = fmtPrice(unit * qty);
  }

  function showMegaPanel(catBtn) {
    var mega = document.getElementById('mega');
    if (!mega) return;
    mega.querySelectorAll('.ig-mega__cat').forEach(function (c) { c.classList.remove('is-active'); });
    catBtn.classList.add('is-active');
    var key = catBtn.getAttribute('data-cat');
    mega.querySelectorAll('[data-panel]').forEach(function (p) { p.hidden = p.getAttribute('data-panel') !== key; });
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      closeAll();
      var mega = document.getElementById('mega');
      if (mega) mega.classList.remove('is-open');
    }
  });

  /* каталог и табы мега-меню раскрываются по наведению */
  var catalogBtn = document.querySelector('[data-toggle="mega"]');
  var megaEl = document.getElementById('mega');
  var mainnav = document.querySelector('.ig-mainnav');
  if (catalogBtn && megaEl && mainnav) {
    var openMega = function () {
      megaEl.classList.add('is-open');
      catalogBtn.setAttribute('aria-expanded', 'true');
      megaEl.setAttribute('aria-hidden', 'false');
    };
    var closeMega = function () {
      megaEl.classList.remove('is-open');
      catalogBtn.setAttribute('aria-expanded', 'false');
      megaEl.setAttribute('aria-hidden', 'true');
    };
    catalogBtn.addEventListener('mouseenter', openMega);
    mainnav.addEventListener('mouseleave', closeMega);
    mainnav.querySelectorAll('.ig-navlink').forEach(function (link) {
      if (link === catalogBtn) return;
      link.addEventListener('mouseenter', closeMega);
    });
    megaEl.querySelectorAll('.ig-mega__cat').forEach(function (cat) {
      cat.addEventListener('mouseenter', function () { showMegaPanel(cat); });
    });
  }

  /* выравниваем подписи быстрых фильтров по левому краю первого чипа */
  var alignQf = function () {
    document.querySelectorAll('.ig-qf').forEach(function (qf) {
      var toolbar = document.querySelector('.ig-toolbar');
      var left = toolbar && toolbar.querySelector('.ig-toolbar__left');
      var chip = left && left.querySelector('.ig-chip');
      if (!left || !chip) return;
      var indent = chip.getBoundingClientRect().left - left.getBoundingClientRect().left;
      if (indent > 0) qf.style.setProperty('--qf-indent', Math.round(indent) + 'px');
    });
  };
  alignQf();
  window.addEventListener('resize', alignQf);
  window.addEventListener('load', alignQf);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(alignQf);
  var qfHost = document.getElementById('ig-qf');
  var tbHost = document.getElementById('ig-tb');
  if (window.MutationObserver && qfHost && tbHost) {
    var mo = new MutationObserver(function () { alignQf(); });
    mo.observe(qfHost, { childList: true, subtree: true });
    mo.observe(tbHost, { childList: true, subtree: true });
  }

  /* полоса направлений: стрелки и запомненная позиция прокрутки */
  document.querySelectorAll('.ig-directions__wrap').forEach(function (wrap) {
    var track = wrap.querySelector('.ig-directions__track');
    var leftBtn = wrap.querySelector('.ig-directions__arrow--left');
    var rightBtn = wrap.querySelector('.ig-directions__arrow--right');
    if (!track) return;
    var update = function () {
      var max = track.scrollWidth - track.clientWidth;
      if (leftBtn) leftBtn.hidden = track.scrollLeft <= 1;
      if (rightBtn) rightBtn.hidden = track.scrollLeft >= max - 1;
    };
    var crumbLinks = document.querySelectorAll('.ig-breadcrumb a');
    var parentHref = crumbLinks.length ? crumbLinks[crumbLinks.length - 1].getAttribute('href') : 'x';
    var key = 'ig-dirs-scroll:' + parentHref + ':' + track.children.length;
    var save = function () { try { sessionStorage.setItem(key, String(Math.round(track.scrollLeft))); } catch (err) {} };
    var max = track.scrollWidth - track.clientWidth;
    var saved = null;
    try { saved = sessionStorage.getItem(key); } catch (err2) {}
    var prevBehavior = track.style.scrollBehavior;
    track.style.scrollBehavior = 'auto';
    if (saved !== null && !isNaN(parseFloat(saved))) track.scrollLeft = Math.max(0, Math.min(max, parseFloat(saved)));
    track.addEventListener('scroll', function () { update(); save(); });
    window.addEventListener('resize', update);
    track.addEventListener('click', save);
    window.addEventListener('pagehide', save);
    var act = track.querySelector('.ig-direction.is-active');
    if (act) {
      var pad = 24, l = act.offsetLeft, r = l + act.offsetWidth;
      if (l < track.scrollLeft + pad || r > track.scrollLeft + track.clientWidth - pad) {
        track.scrollLeft = Math.max(0, Math.min(max, l - (track.clientWidth - act.offsetWidth) / 2));
      }
    }
    requestAnimationFrame(function () { track.style.scrollBehavior = prevBehavior || ''; });
    update();
  });
})();
