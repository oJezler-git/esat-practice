// ==UserScript==
// @name         ESAT Practice – Claude Helper
// @namespace    https://esat-practice
// @version      4.2
// @description  Sends ESAT questions to Claude with the question image attached automatically
// @author       ESAT Practice
// @match        https://esat-practice.vercel.app/
// @match        https://claude.ai/*
// @match        http://localhost:5173/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_openInTab
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      esat-practice.vercel.app
// @connect      localhost
// ==/UserScript==

/**
 * OVERVIEW:
 * This script bridges two separate web domains (ESAT Practice and Claude) using the Tamper/Greasemonkey storage API.
 * 1. ESAT Context: Listens for a specific postMessage from the ESAT app, fetches the target image (bypassing CORS safely via GM_xmlhttpRequest), and stores the prompt/image payload in GM storage.
 * 2. Claude Context: When a new Claude tab opens, it polls GM storage for a payload, reads it, consumes it (deleting it to prevent duplicates), and safely injects the content into Claude's UI.
 * This complies with both sites' TOS and will not attempt to scrape or automate any other functionality beyond the explicit user action of sending a question to Claude.
 */

(function () {
  'use strict';

  // Route execution based on the current domain
  if (window.location.hostname.includes('claude.ai')) {
    setupClaudeSide();
    setupSpaWatcher(); // also catch client-side navigation (e.g. login → /new via history API)
  } else {
    setupEsatSide();
  }

  // Watches for SPA navigation to a chat page and re-runs injection if a payload is waiting.
  // This handles the case where Claude's auth flow navigates back to /new via pushState rather
  // than a full page reload, so setupClaudeSide() never re-runs.
  function setupSpaWatcher() {
    let lastPath = window.location.pathname;

    const onNavigate = () => {
      const newPath = window.location.pathname;
      if (newPath === lastPath) return;
      lastPath = newPath;

      if (newPath.startsWith('/new') || newPath.startsWith('/chat')) {
        setTimeout(() => {
          const raw = GM_getValue('esat-ask-payload', null);
          if (!raw) return;
          let payload;
          try { payload = JSON.parse(raw); } catch (_) { return; }
          injectQuestion(payload).catch(console.error);
        }, 300);
      }
    };

    const origPush = unsafeWindow.history.pushState;
    unsafeWindow.history.pushState = function (...args) {
      origPush.apply(this, args);
      setTimeout(onNavigate, 0);
    };

    const origReplace = unsafeWindow.history.replaceState;
    unsafeWindow.history.replaceState = function (...args) {
      origReplace.apply(this, args);
      setTimeout(onNavigate, 0);
    };

    unsafeWindow.addEventListener('popstate', () => setTimeout(onNavigate, 0));
  }

  // ── ESAT site side ──────────────────────────────────────────────────────────

  function setupEsatSide() {
    // Expose a flag to the underlying page context so the ESAT web app knows the extension is active.
    // We use unsafeWindow because GM scripts run in isolated execution environments.
    unsafeWindow.__esatExtension = true;
    document.dispatchEvent(new CustomEvent('esat-extension-ready'));

    // Listen for events emitted by the ESAT web app safely using the isolated window.
    window.addEventListener('message', async (e) => {
      // Strict origin verification
      const allowedOrigins = ['https://esat-practice.vercel.app', 'http://localhost:5173'];
      if (!allowedOrigins.includes(e.origin)) return;
      if (e.source !== window && e.source !== unsafeWindow) return;
      if (e.data?.type !== 'esat:ask-claude') return;

      const { prompt, imageUrl, imageB64 } = e.data.payload || {};

      // Input validation and size limits (prevent DoS)
      if (typeof prompt !== 'string' || prompt.length > 10000) return;
      if (imageB64 && (typeof imageB64 !== 'string' || !imageB64.startsWith('data:image/'))) return;

      // Ensure we have a base64 Data URI to pass to Claude.
      // If the app provided a direct URL instead of base64, fetch it locally.
      let imageDataUri = imageB64 ?? null;
      if (imageUrl && !imageDataUri) {
        try {
          imageDataUri = await fetchAsDataUri(imageUrl);
        } catch (_) {
          // Proceed without the image if the fetch fails
        }
      }

      // Serialise and store the payload in the global GM store.
      GM_setValue('esat-ask-payload', JSON.stringify({ prompt, imageDataUri }));
      
      // Provide a brief delay so GM_setValue transaction commits before opening the tab.
      await delay(150);
      
      // Open Claude in a new active tab. This tab will trigger the `setupClaudeSide` execution.
      GM_openInTab('https://claude.ai/new', { active: true });
    });
  }

  function fetchAsDataUri(url) {
    return new Promise((resolve, reject) => {
      try {
        const parsedUrl = new URL(url);
        
        // Allow HTTPS for remote domains; allow HTTP only for localhost dev.
        const isLocalhost = parsedUrl.hostname === 'localhost' || parsedUrl.hostname === '127.0.0.1';
        if (parsedUrl.protocol !== 'https:' && !(parsedUrl.protocol === 'http:' && isLocalhost)) {
          return reject(new Error('Security Block: Only HTTPS URLs are allowed (HTTP only permitted for localhost).'));
        }

        // Strict domain whitelisting.
        // This prevents a malicious script on the page from using GM_xmlhttpRequest to bypass CORS and ping arbitrary external domains.
        const allowedDomains = [
          'esat-practice.vercel.app',
          'localhost',
          '127.0.0.1',
        ];
        
        if (!allowedDomains.includes(parsedUrl.hostname)) {
          console.warn('[ESAT] Blocked untrusted image URL:', url);
          return reject(new Error('Security Block: Untrusted image domain (' + parsedUrl.hostname + ')'));
        }
      } catch (e) {
        return reject(new Error('Security Block: Invalid URL structure.'));
      }

      // Fetch the image using GM_xmlhttpRequest to bypass restrictive CORS policies on the target CDN.
      GM_xmlhttpRequest({
        method: 'GET',
        url,
        responseType: 'blob',
        onload(resp) {
          // Ensure the server headers confirm it is an image
          const contentTypeMatch = resp.responseHeaders.match(/content-type:\s*(.*?)(?:\r|\n|$)/i);
          if (!contentTypeMatch || !contentTypeMatch[1].toLowerCase().startsWith('image/')) {
            return reject(new Error('Security Block: Downloaded file is not an image.'));
          }

          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(resp.response);
        },
        onerror: reject,
      });
    });
  }

  // ── Claude side ─────────────────────────────────────────────────────────────

  function setupClaudeSide() {
    // On login/auth pages the user hasn't authenticated yet. Don't consume the payload here —
    // Claude's returnTo param will redirect to /new after login, where this script re-runs and picks it up.
    const path = window.location.pathname;
    if (path.startsWith('/login') || path.startsWith('/logout') || path.startsWith('/auth')) {
      const hasPending = Boolean(GM_getValue('esat-ask-payload', null));
      if (hasPending) {
        showNotification(
          'Log in to continue.',
          'Your ESAT question is queued — it will be injected automatically after you sign in.',
          'warn'
        );
      }
      return;
    }

    let attempts = 0;
    const interval = setInterval(() => {
      attempts++;
      const raw = GM_getValue('esat-ask-payload', null);

      if (raw) {
        clearInterval(interval);
        // Don't delete yet — deletion happens inside injectQuestion after confirming
        // the page hasn't redirected away (e.g. Claude kicking out a logged-out user).
        let payload;
        try { payload = JSON.parse(raw); } catch (_) {
          GM_deleteValue('esat-ask-payload');
          return;
        }
        injectQuestion(payload).catch(console.error);
        return;
      }

      if (attempts >= 20) { clearInterval(interval); }
    }, 250);
  }

  async function injectQuestion({ prompt, imageDataUri }) {
    const input = await waitForInput();
    if (!input) {
      showNotification(
        'Could not find Claude\'s input field.',
        'Are you logged in? Try refreshing and clicking "Ask Claude" again.',
        'error'
      );
      return;
    }

    injectText(input, prompt);

    // Verify text actually landed (ProseMirror may silently reject execCommand if focused elsewhere).
    if (!input.textContent?.trim()) {
      showNotification(
        'Prompt injection failed.',
        'Claude\'s editor did not accept the text. Paste it manually — the prompt has been copied to your clipboard.',
        'warn'
      );
      try { await navigator.clipboard.writeText(prompt); } catch (_) {}
      return;
    }

    if (imageDataUri) {
      await delay(200);
      try {
        await attachImage(input, imageDataUri);
      } catch (_) {
        showNotification(
          'Image could not be attached.',
          'The prompt was injected successfully — attach the question image manually.',
          'warn'
        );
      }
    }

    // Delete the payload only once we're sure the page is stable on a real chat page.
    // Two independent guards:
    //   pagehide  — fires synchronously on full-page navigation away (e.g. hard redirect to /logout)
    //   URL check — catches SPA navigation (pushState) where pagehide never fires
    // Both must pass before we delete.
    let pageLeft = false;
    const onPageHide = () => { pageLeft = true; };
    window.addEventListener('pagehide', onPageHide, { once: true });

    await delay(5000);

    window.removeEventListener('pagehide', onPageHide);

    const stablePath = window.location.pathname;
    if (!pageLeft && (stablePath.startsWith('/new') || stablePath.startsWith('/chat'))) {
      GM_deleteValue('esat-ask-payload');
    }
  }

  function showNotification(title, body, level = 'error') {
    const existing = document.getElementById('esat-notify');
    if (existing) existing.remove();

    const colours = {
      error: { bg: '#3b1f1f', border: '#7f3535', icon: '✕', iconColour: '#f87171' },
      warn:  { bg: '#2e2618', border: '#7a6030', icon: '⚠', iconColour: '#fbbf24' },
    };
    const c = colours[level] ?? colours.error;

    const el = document.createElement('div');
    el.id = 'esat-notify';
    el.setAttribute('role', 'alert');
    Object.assign(el.style, {
      position: 'fixed',
      bottom: '1.5rem',
      right: '1.5rem',
      zIndex: '99999',
      maxWidth: '22rem',
      padding: '0.85rem 1rem',
      borderRadius: '0.75rem',
      border: `1px solid ${c.border}`,
      background: c.bg,
      color: '#e5e7eb',
      fontFamily: 'system-ui, sans-serif',
      fontSize: '0.84rem',
      lineHeight: '1.4',
      boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
      display: 'flex',
      gap: '0.65rem',
      alignItems: 'flex-start',
      animation: 'esat-fadein 0.2s ease',
    });

    el.innerHTML = `
      <style>
        @keyframes esat-fadein { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:translateY(0); } }
        #esat-notify strong { display:block; margin-bottom:0.2rem; font-weight:600; }
        #esat-notify .esat-close { margin-left:auto; padding:0 0.2rem; background:none; border:none; color:#9ca3af; cursor:pointer; font-size:1rem; line-height:1; flex-shrink:0; }
        #esat-notify .esat-close:hover { color:#e5e7eb; }
      </style>
      <span style="color:${c.iconColour};font-weight:700;flex-shrink:0;font-size:1rem;line-height:1.4">${c.icon}</span>
      <span><strong>ESAT Helper: ${title}</strong>${body}</span>
      <button class="esat-close" aria-label="Dismiss">×</button>
    `;

    el.querySelector('.esat-close').addEventListener('click', () => el.remove());
    document.body.appendChild(el);
    setTimeout(() => el?.remove(), 12000);
  }

  function waitForInput(maxMs = 10000) {
    return new Promise((resolve) => {
      // Selector list to survive minor Claude UI changes.
      const selectors = [
        '[data-testid="chat-input"]',
        '.tiptap.ProseMirror',
        '#prompt-textarea',
      ];

      const check = () => {
        for (const sel of selectors) {
          const el = document.querySelector(sel);
          if (el) return el;
        }
        return null;
      };

      const existing = check();
      if (existing) return resolve(existing);

      // Use a MutationObserver to instantly detect when the input mounts, rather than polling.
      const observer = new MutationObserver(() => {
        const el = check();
        if (el) { 
          observer.disconnect(); 
          clearTimeout(timer); 
          resolve(el); 
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });

      const timer = setTimeout(() => { 
        observer.disconnect(); 
        resolve(null); 
      }, maxMs);
    });
  }

  function injectText(input, text) {
    input.focus();
    input.classList.remove('is-empty', 'is-editor-empty');

    // Rather than setting `input.value`, we use `execCommand`. 
    // Claude uses ProseMirror (a rich-text React editor) which ignores direct `.value` mutations. 
    // `execCommand` simulates actual user typing, triggering the necessary React state updates.
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (lines[i]) document.execCommand('insertText', false, lines[i]);
      if (i < lines.length - 1) document.execCommand('insertParagraph');
    }
  }

  async function attachImage(input, dataUri) {
    const blob = await fetch(dataUri).then((r) => r.blob());
    const file = new File([blob], 'question-scan.png', { type: blob.type });

    // Browsers block synthetic drag/paste events from carrying file data (security model).
    // The only reliable path is calling React's internal onChange handler directly via the fiber tree.
    const fileInput = document.querySelector('input[type="file"]');
    if (!fileInput) throw new Error('No file input found');

    const dt = new DataTransfer();
    dt.items.add(file);
    Object.defineProperty(fileInput, 'files', { value: dt.files, configurable: true });

    // Walk the React fiber to find and call the onChange handler directly.
    const fiberKey = Object.keys(fileInput).find(
      (k) => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance')
    );
    if (fiberKey) {
      let fiber = fileInput[fiberKey];
      while (fiber) {
        const onChange = fiber.memoizedProps?.onChange ?? fiber.pendingProps?.onChange;
        if (typeof onChange === 'function') {
          onChange({ target: fileInput, currentTarget: fileInput, type: 'change', bubbles: true });
          return;
        }
        fiber = fiber.return;
      }
    }

    // Fallback: standard DOM events if fiber walk fails.
    fileInput.dispatchEvent(new Event('input',  { bubbles: true }));
    fileInput.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function delay(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }
})();