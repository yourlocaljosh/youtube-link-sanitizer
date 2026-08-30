(() => {
  const api = globalThis.__youtubeLinkSanitizer;
  if (!api) return;
  delete globalThis.__youtubeLinkSanitizer;

  const { sanitizeText, sanitizeTree, sanitizeClipboardItems } = api;
  const PATCH_MARKER = Symbol.for('youtube-link-sanitizer.patched');

  const patchClipboardMethod = (name, wrap) => {
    const prototype = globalThis.Clipboard && globalThis.Clipboard.prototype;
    if (!prototype) return;

    const original = prototype[name];
    if (typeof original !== 'function' || original[PATCH_MARKER]) return;

    const patched = wrap(original);
    Object.defineProperty(patched, PATCH_MARKER, { value: true });
    Object.defineProperty(patched, 'name', { value: name, configurable: true });
    Object.defineProperty(prototype, name, {
      value: patched,
      writable: true,
      enumerable: false,
      configurable: true
    });
  };

  patchClipboardMethod('writeText', (original) =>
    function (data) {
      if (arguments.length === 0) return original.apply(this, arguments);
      return original.call(this, sanitizeText(String(data)));
    }
  );

  patchClipboardMethod('write', (original) =>
    function (items) {
      const clipboard = this;
      return sanitizeClipboardItems(items)
        .then((sanitized) => original.call(clipboard, sanitized))
        .catch(() => original.call(clipboard, items));
    }
  );

  const activeTextField = () => {
    let element = document.activeElement;
    while (element && element.shadowRoot && element.shadowRoot.activeElement) {
      element = element.shadowRoot.activeElement;
    }
    if (!element) return null;
    if (element.tagName === 'TEXTAREA') return element;
    if (element.tagName === 'INPUT' && typeof element.selectionStart === 'number') return element;
    return null;
  };

  const copyFromTextField = (field, clipboardData) => {
    const selected = field.value.slice(field.selectionStart, field.selectionEnd);
    if (!selected) return false;

    const cleaned = sanitizeText(selected);
    if (cleaned === selected) return false;

    clipboardData.setData('text/plain', cleaned);
    return true;
  };

  const copyFromSelection = (clipboardData) => {
    const selection = document.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return false;

    const plain = selection.toString();
    const cleanedPlain = sanitizeText(plain);

    const container = document.createElement('div');
    container.appendChild(selection.getRangeAt(0).cloneContents());
    const markupChanged = sanitizeTree(container);

    if (cleanedPlain === plain && !markupChanged) return false;

    clipboardData.setData('text/plain', cleanedPlain);
    clipboardData.setData('text/html', container.innerHTML);
    return true;
  };

  document.addEventListener(
    'copy',
    (event) => {
      const clipboardData = event.clipboardData;
      if (!clipboardData) return;

      const field = activeTextField();
      const handled = field
        ? copyFromTextField(field, clipboardData)
        : copyFromSelection(clipboardData);

      if (handled) event.preventDefault();
    },
    true
  );
})();
