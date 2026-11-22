// ==UserScript==
// @name         vnbypass.com no ads
// @namespace    https://vnbypass.com/
// @version      1.0
// @match        https://vnbypass.com/*
// @match        http://vnbypass.com/*
// @run-at       document-start
// @grant        none
// @noframes
// ==/UserScript==

(function () {
  'use strict';

  const DEBUG = false;
  const BLOCK_ADS = true;
  const log = (...a) => { if (DEBUG) console.log('[vnbp-noab]', ...a); };

  try { sessionStorage.removeItem('vn_ab_locked'); } catch {}
  try {
    const _setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'vn_ab_locked') { log('block setItem:', key); return; }
      return _setItem.call(this, key, value);
    };
  } catch {}

  const BAIT_RE = /adsbox|ad-banner|ad-placement|sponsored-ad|pub_300x250|textads|ad-footer|ad_box|banner_ad|div-gpt-ad|ad-slot|advertisement/i;
  const SLOT_IDS = new Set(['nativeAdSlot', 'bannerAdSlot', 'bannerAdSpace', 'vn-ad-bait-slot']);

  const isBait = (el) => {
    if (!el || el.nodeType !== 1) return false;
    if (el.id && SLOT_IDS.has(el.id)) return true;
    const cls = el.getAttribute && el.getAttribute('class');
    return !!cls && BAIT_RE.test(cls);
  };

  const _getComputedStyle = window.getComputedStyle;
  window.getComputedStyle = function (el, pseudo) {
    const st = _getComputedStyle.call(window, el, pseudo);
    if (!pseudo && isBait(el)) {
      return new Proxy(st, {
        get(target, prop) {
          if (prop === 'display') return 'block';
          if (prop === 'visibility') return 'visible';
          if (prop === 'opacity') return '1';
          const v = Reflect.get(target, prop);
          return typeof v === 'function' ? v.bind(target) : v;
        }
      });
    }
    return st;
  };

  const _getBoundingClientRect = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function () {
    if (isBait(this)) {
      return {
        x: 0, y: 0, top: 0, left: 0, right: 300, bottom: 250,
        width: 300, height: 250,
        toJSON() { return this; }
      };
    }
    return _getBoundingClientRect.call(this);
  };

  const AD_HOST_RE = /(googlesyndication\.com|doubleclick\.net|adservice\.google\.com|araplhn\.org|abscloud\.org|bauval\.org|robuxvien\.com|googleadservices\.com|googletag|adtrafficquality|amazon-adsystem\.com|taboola\.com|outbrain\.com|criteo\.com|pubmatic\.com|rubiconproject\.com|casalemedia\.com|openx\.net)/i;
  const _fetch = window.fetch;

  window.fetch = function (input, init) {
    let url = '';
    try {
      url = typeof input === 'string' ? input : ((input && input.url) || String(input));
    } catch {}

    const isProbe =
      init &&
      init.mode === 'no-cors' &&
      init.credentials === 'omit' &&
      init.cache === 'no-store';

    if (isProbe) {
      log('fake probe OK:', url);
      return Promise.resolve(new Response('', { status: 200 }));
    }

    if (BLOCK_ADS && AD_HOST_RE.test(url)) {
      log('block ad fetch:', url);
      return Promise.resolve(new Response('', {
        status: 200,
        headers: { 'Content-Type': 'application/javascript' }
      }));
    }

    return _fetch.apply(this, arguments);
  };

  const _open = window.open;
  window.open = function (url) {
    if (typeof url === 'string' && AD_HOST_RE.test(url)) {
      log('block popunder:', url);
      return null;
    }
    return _open.apply(window, arguments);
  };

  const clearGuard = () => {
    document.querySelectorAll('[data-vn-guard]').forEach((el) => el.remove());
    try {
      document.documentElement.style.overflow = '';
      if (document.body) document.body.style.overflow = '';
    } catch {}
  };

  try {
    new MutationObserver(() => {
      if (document.querySelector('[data-vn-guard]')) clearGuard();
    }).observe(document.documentElement, { childList: true, subtree: true });
  } catch {}

  let noAdsState = { active: true };
  try {
    Object.defineProperty(window, '__VN_NOADS__', {
      configurable: true,
      get() { return noAdsState; },
      set(value) {
        const base = (value && typeof value === 'object') ? value : {};
        noAdsState = new Proxy(base, {
          get(target, prop) {
            if (prop === 'active') return true;
            if (prop === 'expired') return false;
            return target[prop];
          }
        });
        log('forced __VN_NOADS__.active = true');
      }
    });
  } catch {}

  if (BLOCK_ADS) {
    const forceNoAdsClass = () => {
      try {
        const html = document.documentElement;
        if (html && !html.classList.contains('noads-active')) {
          html.classList.add('noads-active');
          log('html.noads-active added');
        }
      } catch {}
    };
    forceNoAdsClass();

    try {
      new MutationObserver(forceNoAdsClass).observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['class']
      });
    } catch {}

    const AD_CSS = `
      html.noads-active .ad-strip,
      html.noads-active #nativeAdSlot,
      html.noads-active .ad-block,
      .ad-strip, .ad-house, #nativeAdSlot, .native-ad-wrap, .native-ad-container,
      .banner-160x300-box, .banner-ad-space, .direct-ad-card,
      .ad-label, .ad-chip, .ad-open-btn, .adsbygoogle,
      ins.adsbygoogle, [id^="div-gpt-ad"], [id^="google_ads_iframe"], [id^="aswift_"],
      iframe[src*="googlesyndication.com"], iframe[src*="doubleclick.net"],
      iframe[src*="adservice.google.com"], iframe[src*="araplhn.org"],
      iframe[src*="abscloud.org"], iframe[src*="bauval.org"], iframe[src*="robuxvien.com"],
      a[href*="araplhn.org"] {
        display: none !important;
        visibility: hidden !important;
        height: 0 !important;
        min-height: 0 !important;
        width: 0 !important;
        min-width: 0 !important;
        margin: 0 !important;
        padding: 0 !important;
        border: 0 !important;
        overflow: hidden !important;
      }
    `;
    const injectCSS = () => {
      if (document.getElementById('vnbp-noads-css')) return;
      const st = document.createElement('style');
      st.id = 'vnbp-noads-css';
      st.textContent = AD_CSS;
      (document.head || document.documentElement).appendChild(st);
    };
    injectCSS();

    try {
      const stub = { push() {}, loaded: true };
      Object.defineProperty(window, 'adsbygoogle', {
        configurable: true,
        get() { return stub; },
        set() {}
      });
    } catch {}

    try {
      const _xhrOpen = XMLHttpRequest.prototype.open;
      XMLHttpRequest.prototype.open = function (method, url) {
        try { this.__vnAd = AD_HOST_RE.test(String(url)); } catch {}
        return _xhrOpen.apply(this, arguments);
      };
      const _xhrSend = XMLHttpRequest.prototype.send;
      XMLHttpRequest.prototype.send = function () {
        if (this.__vnAd) { log('block ad xhr'); try { this.abort(); } catch {} return; }
        return _xhrSend.apply(this, arguments);
      };
    } catch {}

    try {
      const _beacon = navigator.sendBeacon;
      if (_beacon) {
        navigator.sendBeacon = function (url, data) {
          if (AD_HOST_RE.test(String(url))) { log('block beacon:', url); return true; }
          return _beacon.call(navigator, url, data);
        };
      }
    } catch {}

    try {
      const desc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
      if (desc && desc.set && desc.get) {
        Object.defineProperty(HTMLImageElement.prototype, 'src', {
          configurable: true,
          get() { return desc.get.call(this); },
          set(v) {
            if (AD_HOST_RE.test(String(v))) { log('block pixel:', v); return; }
            return desc.set.call(this, v);
          }
        });
      }
    } catch {}

    const isAdNode = (node) => {
      if (!node || node.nodeType !== 1) return false;
      const tag = node.tagName;
      const src = node.getAttribute && (node.getAttribute('src') || node.getAttribute('href') || node.getAttribute('data-src') || '');
      if (src && AD_HOST_RE.test(src)) return true;
      if (tag === 'INS' && (node.className || '').includes('adsbygoogle')) return true;
      if (node.id && /^(div-gpt-ad|google_ads_iframe|aswift_)/i.test(node.id)) return true;
      return false;
    };

    const killAdNode = (node) => {
      if (!isAdNode(node)) return;
      log('remove ad node:', node.tagName, node.getAttribute && (node.getAttribute('src') || node.getAttribute('href') || ''));
      try {
        if (node.getAttribute) {
          if (node.hasAttribute('src')) node.setAttribute('src', 'about:blank');
          if (node.hasAttribute('href')) node.setAttribute('href', '#');
        }
      } catch {}
      try { node.remove(); } catch {}
    };

    const sweep = (root) => {
      if (!root || root.nodeType !== 1) return;
      if (isAdNode(root)) { killAdNode(root); return; }
      const sel = 'script[src],iframe[src],link[href],img[src],ins.adsbygoogle,[id^="div-gpt-ad"],[id^="google_ads_iframe"],[id^="aswift_"]';
      let list;
      try { list = root.querySelectorAll(sel); } catch { return; }
      list.forEach(killAdNode);
      try {
        root.querySelectorAll('.native-ad-container, .banner-ad-space').forEach((c) => {
          c.querySelectorAll('iframe,script,ins,img,a').forEach(killAdNode);
        });
      } catch {}
    };

    try {
      new MutationObserver((muts) => {
        for (const m of muts) {
          m.addedNodes && m.addedNodes.forEach((n) => {
            if (n.nodeType !== 1) return;
            sweep(n);
          });
        }
      }).observe(document.documentElement, { childList: true, subtree: true });
    } catch {}
  }

  document.addEventListener('DOMContentLoaded', () => {
    try { sessionStorage.removeItem('vn_ab_locked'); } catch {}
    clearGuard();

    if (BLOCK_ADS) {
      try { document.documentElement.classList.add('noads-active'); } catch {}
      if (!document.getElementById('vnbp-noads-css')) {
        const st = document.createElement('style');
        st.id = 'vnbp-noads-css';
        st.textContent = '';
        (document.head || document.documentElement).appendChild(st);
      }
      try {
        document.querySelectorAll(
          '.native-ad-container iframe, .native-ad-container script, .native-ad-container ins, ' +
          '.banner-ad-space iframe, .banner-ad-space img, ' +
          'ins.adsbygoogle, [id^="div-gpt-ad"], [id^="google_ads_iframe"]'
        ).forEach((el) => {
          try { el.setAttribute('src', 'about:blank'); } catch {}
          try { el.remove(); } catch {}
        });
      } catch {}
    }

    const btn = document.getElementById('bypassBtn');
    if (btn) btn.disabled = false;
    const input = document.getElementById('urlInput');
    if (input) input.disabled = false;
  });

  log('ready v1.1.1');
})();
