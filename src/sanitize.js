(() => {
  const YOUTUBE_DOMAINS = ['youtube.com', 'youtu.be', 'youtube-nocookie.com'];

  const TRACKING_PARAMS = [
    'si',
    'pp',
    'feature',
    'ab_channel',
    'kw',
    'attr_tag',
    'source_ve_path',
    'embeds_referring_euri',
    'embeds_referring_origin',
    'embeds_euri',
    'embeds_origin',
    'embeds_widget_referrer',
    'themeRefresh',
    'utm_source',
    'utm_medium',
    'utm_campaign',
    'utm_term',
    'utm_content',
    'utm_id',
    'utm_name',
    'utm_reader',
    'utm_referrer',
    'utm_social',
    'gclid',
    'dclid',
    'fbclid',
    'msclkid',
    'twclid',
    'ttclid',
    'yclid',
    'igshid',
    'mc_eid',
    'mc_cid',
    'vero_id',
    'vero_conv',
    'ref_src',
    'ref_url'
  ];

  const TRACKING_PREFIXES = ['utm_'];

  const PRESERVED_PARAMS = [
    'v',
    't',
    'start',
    'end',
    'list',
    'index',
    'playlist',
    'search_query',
    'time_continue',
    'lc',
    'app',
    'hl',
    'gl'
  ];

  const TEXT_MIME_TYPES = ['text/plain', 'text/uri-list'];

  const LINK_PATTERN =
    /(?:https?:\/\/)?(?:[\w-]+\.)*(?:youtube\.com|youtu\.be|youtube-nocookie\.com)\/[^\s<>"'`]*/gi;

  const TRAILING_PATTERN = /[)\]}>.,;:!?'"]+$/;

  const trackingLookup = new Set(TRACKING_PARAMS.map((name) => name.toLowerCase()));
  const preservedLookup = new Set(PRESERVED_PARAMS.map((name) => name.toLowerCase()));

  const isTrackingParam = (name) => {
    const key = String(name).toLowerCase();
    if (preservedLookup.has(key)) return false;
    if (trackingLookup.has(key)) return true;
    return TRACKING_PREFIXES.some((prefix) => key.startsWith(prefix));
  };

  const isYouTubeHost = (hostname) => {
    const host = String(hostname).toLowerCase().replace(/\.+$/, '');
    return YOUTUBE_DOMAINS.some((domain) => host === domain || host.endsWith('.' + domain));
  };

  const sanitizeUrl = (input) => {
    if (typeof input !== 'string' || input.length === 0) return input;

    let url;
    try {
      url = new URL(input);
    } catch {
      return input;
    }

    if (url.protocol !== 'https:' && url.protocol !== 'http:') return input;
    if (!isYouTubeHost(url.hostname)) return input;

    const doomed = [];
    url.searchParams.forEach((_value, name) => {
      if (isTrackingParam(name)) doomed.push(name);
    });
    if (doomed.length === 0) return input;

    for (const name of doomed) url.searchParams.delete(name);
    return url.toString();
  };

  const sanitizeText = (input) => {
    if (typeof input !== 'string' || input.length === 0) return input;

    return input.replace(LINK_PATTERN, (match) => {
      const trailingMatch = TRAILING_PATTERN.exec(match);
      const trailing = trailingMatch ? trailingMatch[0] : '';
      const candidate = trailing ? match.slice(0, match.length - trailing.length) : match;
      const hasScheme = /^https?:\/\//i.test(candidate);
      const cleaned = sanitizeUrl(hasScheme ? candidate : 'https://' + candidate);
      const restored = hasScheme ? cleaned : cleaned.replace(/^https:\/\//, '');
      return restored + trailing;
    });
  };

  const sanitizeTree = (root) => {
    let changed = false;

    root.querySelectorAll('a[href]').forEach((anchor) => {
      const href = anchor.getAttribute('href');
      const cleaned = sanitizeUrl(href);
      if (cleaned !== href) {
        anchor.setAttribute('href', cleaned);
        changed = true;
      }
    });

    const walker = (root.ownerDocument || document).createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      const value = node.nodeValue;
      const cleaned = sanitizeText(value);
      if (cleaned !== value) {
        node.nodeValue = cleaned;
        changed = true;
      }
      node = walker.nextNode();
    }

    return changed;
  };

  const sanitizeHtml = (html) => {
    if (typeof html !== 'string' || html.length === 0) return html;
    const parsed = new DOMParser().parseFromString(html, 'text/html');
    if (!sanitizeTree(parsed.body)) return html;
    return parsed.body.innerHTML;
  };

  const sanitizeClipboardItem = async (item) => {
    const types = item && item.types ? Array.from(item.types) : [];
    if (types.length === 0) return item;

    const payload = {};
    let changed = false;

    for (const type of types) {
      const blob = await item.getType(type);
      if (type !== 'text/html' && !TEXT_MIME_TYPES.includes(type)) {
        payload[type] = blob;
        continue;
      }
      const text = await blob.text();
      const cleaned = type === 'text/html' ? sanitizeHtml(text) : sanitizeText(text);
      if (cleaned !== text) changed = true;
      payload[type] = new Blob([cleaned], { type });
    }

    return changed ? new ClipboardItem(payload) : item;
  };

  const sanitizeClipboardItems = async (items) => {
    if (typeof ClipboardItem !== 'function') return items;

    const sanitized = [];
    for (const item of Array.from(items || [])) {
      sanitized.push(await sanitizeClipboardItem(item));
    }
    return sanitized;
  };

  globalThis.__youtubeLinkSanitizer = Object.freeze({
    isTrackingParam,
    isYouTubeHost,
    sanitizeUrl,
    sanitizeText,
    sanitizeTree,
    sanitizeHtml,
    sanitizeClipboardItems,
    trackingParams: Object.freeze(TRACKING_PARAMS.slice()),
    trackingPrefixes: Object.freeze(TRACKING_PREFIXES.slice()),
    preservedParams: Object.freeze(PRESERVED_PARAMS.slice()),
    youtubeDomains: Object.freeze(YOUTUBE_DOMAINS.slice())
  });
})();
