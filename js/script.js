/* Kimaya Churi · Portfolio
   Small, dependency-light enhancements. Every feature checks for its
   elements first, and the page stays fully readable without this file
   or without anime.js. */
(function () {
  'use strict';

  var root = document.documentElement;
  var prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var hasAnime = typeof window.anime === 'function';
  var canAnimate = hasAnime && !prefersReducedMotion;

  // Tell the CSS that the script booted, which cancels the reveal fallback.
  root.classList.add('js-ready');

  /* ---------- Footer year ---------- */
  function initYear() {
    var el = document.querySelector('[data-year]');
    if (el) el.textContent = String(new Date().getFullYear());
  }

  /* ---------- Header: hairline once the page has scrolled ---------- */
  function initHeaderState() {
    var header = document.querySelector('[data-header]');
    var hero = document.querySelector('.hero');
    if (!header || !hero || !('IntersectionObserver' in window)) return;

    var sentinel = document.createElement('div');
    sentinel.setAttribute('aria-hidden', 'true');
    sentinel.style.cssText = 'position:absolute;top:0;left:0;width:1px;height:1px;';
    document.body.prepend(sentinel);

    new IntersectionObserver(function (entries) {
      header.classList.toggle('is-scrolled', !entries[0].isIntersecting);
    }).observe(sentinel);
  }

  /* ---------- Compact (mobile) navigation ---------- */
  function initMobileNav() {
    var header = document.querySelector('[data-header]');
    var toggle = document.querySelector('[data-nav-toggle]');
    var menu = document.querySelector('[data-nav-menu]');
    if (!header || !toggle || !menu) return;

    var label = toggle.querySelector('.nav-toggle-label');

    function setOpen(open) {
      header.classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', String(open));
      if (label) label.textContent = open ? 'Close' : 'Menu';
    }

    toggle.addEventListener('click', function () {
      setOpen(toggle.getAttribute('aria-expanded') !== 'true');
    });

    // Close after choosing a destination.
    menu.addEventListener('click', function (event) {
      if (event.target.closest('a')) setOpen(false);
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && header.classList.contains('is-open')) {
        setOpen(false);
        toggle.focus();
      }
    });

    // Close when clicking outside the header.
    document.addEventListener('click', function (event) {
      if (header.classList.contains('is-open') && !header.contains(event.target)) setOpen(false);
    });

    // Reset when returning to the desktop layout.
    window.matchMedia('(min-width: 56.3125em)').addEventListener('change', function (mq) {
      if (mq.matches) setOpen(false);
    });
  }

  /* ---------- Active section in the navigation ---------- */
  function initActiveSection() {
    var links = Array.prototype.slice.call(document.querySelectorAll('.nav-link[href^="#"]'));
    if (!links.length || !('IntersectionObserver' in window)) return;

    var byId = {};
    links.forEach(function (link) { byId[link.getAttribute('href').slice(1)] = link; });

    var sections = Object.keys(byId)
      .map(function (id) { return document.getElementById(id); })
      .filter(Boolean);

    function setActive(id) {
      links.forEach(function (link) {
        if (link === byId[id]) link.setAttribute('aria-current', 'true');
        else link.removeAttribute('aria-current');
      });
    }

    // A thin band across the upper middle of the viewport decides the active section.
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) setActive(entry.target.id);
      });
    }, { rootMargin: '-35% 0px -60% 0px' });

    sections.forEach(function (section) { observer.observe(section); });

    // Clear the state while the hero is in view.
    var hero = document.querySelector('.hero');
    if (hero) {
      new IntersectionObserver(function (entries) {
        if (entries[0].isIntersecting) setActive(null);
      }, { rootMargin: '-35% 0px -60% 0px' }).observe(hero);
    }
  }

  /* ---------- Project illustrations: draw strokes when revealed ---------- */
  function animateProjectVisual(project) {
    if (!canAnimate) return;
    var strokes = project.querySelectorAll('.draw');
    var pixels = project.querySelectorAll('.px, .bar, .node');

    if (strokes.length) {
      window.anime({
        targets: strokes,
        strokeDashoffset: [window.anime.setDashoffset, 0],
        duration: 1600,
        delay: window.anime.stagger(55),
        easing: 'easeInOutCubic'
      });
    }

    if (pixels.length) {
      window.anime({
        targets: pixels,
        opacity: [0, 1],
        duration: 700,
        delay: window.anime.stagger(6, { from: 'center' }),
        easing: 'easeOutQuad'
      });
    }
  }

  /* ---------- Scroll reveals ---------- */
  function initReveals() {
    var items = Array.prototype.slice.call(document.querySelectorAll('[data-reveal]'));
    if (!items.length) return;

    // Small stagger for siblings that enter together.
    items.forEach(function (item) {
      var group = item.parentElement ? item.parentElement.querySelectorAll(':scope > [data-reveal]') : [];
      var index = Array.prototype.indexOf.call(group, item);
      if (index > 0) item.style.setProperty('--delay', Math.min(index, 4) * 90 + 'ms');
    });

    if (prefersReducedMotion || !('IntersectionObserver' in window)) {
      items.forEach(function (item) { item.classList.add('is-in'); });
      return;
    }

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        el.classList.add('is-in');
        if (el.hasAttribute('data-project')) animateProjectVisual(el);
        observer.unobserve(el);
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.08 });

    items.forEach(function (item) {
      // Hero items are handled by the intro sequence.
      if (!item.closest('.hero')) observer.observe(item);
    });
  }

  /* ---------- Hero entrance ---------- */
  function initHero() {
    var lines = document.querySelectorAll('[data-hero-line]');
    var others = document.querySelectorAll('.hero [data-reveal]');

    function showAll() {
      Array.prototype.forEach.call(lines, function (el) { el.classList.add('is-in'); });
      Array.prototype.forEach.call(others, function (el) { el.classList.add('is-in'); });
    }

    if (!canAnimate) { showAll(); return; }

    // anime.js drives these frame by frame, so the CSS transition must step aside.
    Array.prototype.forEach.call(lines, function (el) { el.style.transition = 'none'; });

    window.anime.timeline({ easing: 'cubicBezier(0.16, 1, 0.3, 1)' })
      .add({
        targets: lines,
        translateY: ['0.35em', 0],
        opacity: [0, 1],
        duration: 1300,
        delay: window.anime.stagger(120)
      })
      .add({
        targets: '.accent-dot',
        scale: [0, 1],
        duration: 700,
        easing: 'easeOutBack'
      }, '-=700');

    // Supporting elements use the CSS transition, timed after the name.
    Array.prototype.forEach.call(others, function (el, i) {
      el.style.setProperty('--delay', 250 + i * 120 + 'ms');
      el.classList.add('is-in');
    });
    // Leave the name lines in their final state for CSS once anime has finished.
    setTimeout(function () {
      Array.prototype.forEach.call(lines, function (el) { el.classList.add('is-in'); });
    }, 1600);
  }

  /* ---------- Contact form (Netlify Forms, submitted with fetch) ----------
     Without JavaScript the form still posts normally to Netlify. */
  function initContactForm() {
    var form = document.querySelector('[data-contact-form]');
    if (!form || !window.fetch || !window.FormData || !window.URLSearchParams) return;

    var status = form.querySelector('[data-form-status]');
    var submit = form.querySelector('[data-submit]');
    var submitLabel = form.querySelector('[data-submit-label]');
    var fields = Array.prototype.slice.call(form.querySelectorAll('.field input, .field textarea'));

    var messages = {
      name: { valueMissing: 'Please enter your name.' },
      email: {
        valueMissing: 'Please enter your email address.',
        typeMismatch: 'Please enter a valid email address, like name@example.com.'
      },
      message: {
        valueMissing: 'Please write a message.',
        tooShort: 'Please add a little more detail (at least 10 characters).'
      }
    };

    // Custom inline errors replace the browser's validation bubbles.
    form.noValidate = true;

    function errorFor(field) {
      var custom = messages[field.name] || {};
      if (!field.value.trim()) return custom.valueMissing || field.validationMessage;
      if (field.name === 'message' && field.value.trim().length < 10) return custom.tooShort;
      if (field.validity.valid) return '';
      for (var key in custom) {
        if (field.validity[key]) return custom[key];
      }
      return field.validationMessage;
    }

    function showError(field, message) {
      var el = form.querySelector('[data-error-for="' + field.name + '"]');
      if (message) field.setAttribute('aria-invalid', 'true');
      else field.removeAttribute('aria-invalid');
      if (el) el.textContent = message;
    }

    function setStatus(text, state) {
      if (!status) return;
      status.textContent = text;
      status.className = 'form-status' + (state ? ' ' + state : '');
    }

    function setBusy(busy) {
      if (submit) submit.disabled = busy;
      if (submitLabel) submitLabel.textContent = busy ? 'Sending…' : 'Send message';
      form.setAttribute('aria-busy', String(busy));
    }

    fields.forEach(function (field) {
      // Validate once the visitor leaves a field they have typed in...
      field.addEventListener('blur', function () {
        if (field.value) showError(field, errorFor(field));
      });
      // ...and clear the error as soon as it is fixed.
      field.addEventListener('input', function () {
        if (field.getAttribute('aria-invalid') === 'true') showError(field, errorFor(field));
      });
    });

    form.addEventListener('submit', function (event) {
      event.preventDefault();

      var firstInvalid = null;
      fields.forEach(function (field) {
        var message = errorFor(field);
        showError(field, message);
        if (message && !firstInvalid) firstInvalid = field;
      });

      if (firstInvalid) {
        setStatus('', '');
        firstInvalid.focus();
        return;
      }

      setBusy(true);
      setStatus('', '');

      fetch('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(new FormData(form)).toString()
      })
        .then(function (response) {
          if (!response.ok) throw new Error('Form submission failed: ' + response.status);
          form.reset();
          setStatus('Thanks, your message has been sent.', 'is-success');
        })
        .catch(function () {
          var mailLink = document.querySelector('a[href^="mailto:"]');
          var address = mailLink ? mailLink.getAttribute('href').slice('mailto:'.length) : '';
          setStatus('Your message could not be sent. Please try again' + (address ? ', or email ' + address + ' directly.' : '.'), 'is-error');
        })
        .then(function () { setBusy(false); });
    });
  }

  function init() {
    initContactForm();
    initYear();
    initHeaderState();
    initMobileNav();
    initActiveSection();
    initHero();
    initReveals();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();