// SRTDrive project page. Everything here is progressive enhancement:
// without JavaScript the page shows both method figures and the "replace" schematic.

// Hero schematic: switch between the two selector outcomes.
const scene = document.querySelector('.scene');
if (scene) {
  const control = scene.querySelector('.scene-switch');
  const buttons = [...control.querySelectorAll('[data-scene-btn]')];
  control.hidden = false;
  for (const button of buttons) {
    button.addEventListener('click', () => {
      scene.dataset.scene = button.dataset.sceneBtn;
      for (const other of buttons) other.setAttribute('aria-pressed', String(other === button));
    });
  }
}

// Method figures: overview and architecture share one frame.
for (const group of document.querySelectorAll('[data-figure-tabs]')) {
  const list = group.querySelector('[role="tablist"]');
  const tabs = [...list.querySelectorAll('[role="tab"]')];
  const select = (tab, focus = false) => {
    for (const other of tabs) {
      const active = other === tab;
      other.setAttribute('aria-selected', String(active));
      other.tabIndex = active ? 0 : -1;
      document.getElementById(other.getAttribute('aria-controls')).hidden = !active;
    }
    if (focus) tab.focus();
  };
  list.hidden = false;
  select(tabs[0]);
  for (const tab of tabs) tab.addEventListener('click', () => select(tab));
  list.addEventListener('keydown', event => {
    const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
    if (!step) return;
    event.preventDefault();
    const current = tabs.findIndex(tab => tab.getAttribute('aria-selected') === 'true');
    select(tabs[(current + step + tabs.length) % tabs.length], true);
  });
}

// Figures open enlarged in a dialog; modified clicks still open the image file.
const lightbox = document.querySelector('.lightbox');
if (lightbox && typeof lightbox.showModal === 'function') {
  let trigger = null;
  const expanded = lightbox.querySelector('[data-figure-expanded]');
  const original = lightbox.querySelector('[data-figure-original]');
  for (const link of document.querySelectorAll('[data-figure-link]')) {
    link.addEventListener('click', event => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return;
      event.preventDefault();
      trigger = link;
      expanded.src = link.href;
      expanded.alt = link.dataset.figureAlt || link.querySelector('img')?.alt || '';
      original.href = link.href;
      lightbox.showModal();
      document.body.classList.add('is-locked');
    });
  }
  lightbox.querySelector('[data-figure-close]').addEventListener('click', () => lightbox.close());
  lightbox.addEventListener('click', event => {
    if (event.target === lightbox) lightbox.close();
  });
  lightbox.addEventListener('close', () => {
    document.body.classList.remove('is-locked');
    trigger?.focus({ preventScroll: true });
  });
}

// Copy BibTeX.
for (const button of document.querySelectorAll('[data-copy]')) {
  if (!navigator.clipboard) continue;
  const source = document.querySelector(button.dataset.copy);
  const status = button.parentElement.querySelector('.copy-status');
  let timer;
  button.hidden = false;
  button.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(source.textContent.trim());
      status.textContent = 'Copied';
    } catch {
      status.textContent = 'Copy failed. Select the text and copy it manually.';
    }
    clearTimeout(timer);
    timer = setTimeout(() => { status.textContent = ''; }, 2400);
  });
}

// Mark the section in view in the header navigation.
const navLinks = [...document.querySelectorAll('.site-header nav a')];
if ('IntersectionObserver' in window && navLinks.length) {
  const visible = new Set();
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) entry.isIntersecting ? visible.add(entry.target.id) : visible.delete(entry.target.id);
    const current = navLinks.find(link => visible.has(link.hash.slice(1)));
    for (const link of navLinks) current === link ? link.setAttribute('aria-current', 'location') : link.removeAttribute('aria-current');
  }, { rootMargin: '-90px 0px -55% 0px' });
  for (const link of navLinks) {
    const section = document.querySelector(link.hash);
    if (section) observer.observe(section);
  }
}
