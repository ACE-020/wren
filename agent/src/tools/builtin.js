import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

/** @type {import('./registry.js').ToolDefinition} */
export const currentTime = {
  name: 'current_time',
  description: '获取当前日期时间。需要知道「今天」「现在」「本周」等时才调用。',
  parameters: {
    type: 'object',
    properties: {
      timezone: { type: 'string', description: 'IANA 时区名，如 Asia/Shanghai；省略时用本机时区' },
    },
  },
  execute({ timezone }) {
    const tz = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
    try {
      const text = new Intl.DateTimeFormat('zh-CN', {
        timeZone: tz,
        dateStyle: 'full',
        timeStyle: 'long',
      }).format(new Date());
      return { timezone: tz, now: text, iso: new Date().toISOString() };
    } catch {
      throw new Error(`未知时区：${timezone}`);
    }
  },
};

const FETCH_MAX_BYTES = 2_000_000;

/**
 * 抓取网页正文。默认不对模型开放（exposure: on-demand），由上层按需开放。
 * @type {import('./registry.js').ToolDefinition}
 */
export const fetchUrl = {
  name: 'fetch_url',
  description: '抓取一个公开网页，返回去掉标签后的正文文本（最多约 2 万字）。',
  parameters: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'http 或 https 地址' },
    },
    required: ['url'],
  },
  exposure: 'on-demand',
  timeoutMs: 20_000,
  async execute({ url }, { signal }) {
    const target = await assertPublicUrl(url);
    const res = await fetch(target, {
      signal,
      redirect: 'manual',
      headers: { 'User-Agent': 'Wren/0.1 (+fetch_url)', Accept: 'text/html,text/plain,*/*' },
    });
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      return { status: res.status, redirect: location ? new URL(location, target).href : null,
        note: '目标发生跳转，如需继续请用新地址再次调用。' };
    }
    const type = res.headers.get('content-type') ?? '';
    if (!/^(text\/|application\/(json|xml|xhtml))/.test(type)) {
      return { status: res.status, content_type: type, note: '不是文本内容，未读取。' };
    }
    const raw = await readLimited(res, FETCH_MAX_BYTES);
    const text = type.includes('html') ? htmlToText(raw) : raw;
    return { status: res.status, url: res.url || target.href, text };
  },
};

/** @param {unknown} url */
async function assertPublicUrl(url) {
  let target;
  try {
    target = new URL(String(url));
  } catch {
    throw new Error('url 不合法');
  }
  if (target.protocol !== 'http:' && target.protocol !== 'https:') throw new Error('只支持 http/https');
  const host = target.hostname.replace(/^\[|\]$/g, '');
  const addresses = isIP(host) ? [host] : (await lookup(host, { all: true })).map((a) => a.address);
  if (addresses.some(isPrivateAddress)) throw new Error('不允许访问本机或内网地址');
  return target;
}

/** @param {string} ip */
export function isPrivateAddress(ip) {
  if (ip.includes(':')) {
    const v = ip.toLowerCase();
    if (v.startsWith('::ffff:')) return isPrivateAddress(v.slice(7));
    return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80');
  }
  const [a, b] = ip.split('.').map(Number);
  return (
    a === 10 || a === 127 || a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}

/**
 * @param {Response} res
 * @param {number} max
 */
async function readLimited(res, max) {
  if (!res.body) return '';
  const decoder = new TextDecoder();
  let size = 0;
  let out = '';
  for await (const chunk of res.body) {
    size += chunk.byteLength;
    out += decoder.decode(chunk, { stream: true });
    if (size >= max) break;
  }
  return out;
}

/** @param {string} html */
export function htmlToText(html) {
  return html
    .replace(/<(script|style|noscript|svg|head)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n\n')
    .trim();
}
