import DOMPurify from 'dompurify';
import { marked } from 'marked';

marked.setOptions({ gfm: true, breaks: true });

/**
 * 模型输出 → 安全的 HTML。模型输出属于不可信内容，必须经过 DOMPurify。
 * @param {string} text
 */
export function renderMarkdown(text) {
  const html = /** @type {string} */ (marked.parse(text ?? '', { async: false }));
  return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
}
