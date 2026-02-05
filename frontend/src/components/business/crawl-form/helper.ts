export const deriveOutDir = (raw: string): string => {
  if (!raw) return '';
  let pathname;
  try {
    pathname = new URL(raw).pathname || '';
  } catch {
    const stripped = String(raw).split('?')[0].split('#')[0];
    const idx = stripped.lastIndexOf('/');
    pathname = idx >= 0 ? stripped.slice(idx) : stripped;
  }
  pathname = pathname.replace(/\/+$/, '');
  let segment = pathname.split('/').filter(Boolean).pop() || '';
  segment = segment.replace(/\.[^./?#]+$/, '');
  if (!segment) {
    try {
      segment = new URL(raw).hostname.replace(/^www\./, '');
    } catch {
      // ignore
    }
  }
  return segment
    .trim()
    .replace(/[^\w-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
};
