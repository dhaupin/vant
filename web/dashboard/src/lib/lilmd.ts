/**
 * lilmd — the lander's homebrew markdown renderer (wave 19.28, no deps).
 * =========================================================================
 * The owner's lander content speaks markdown; this module turns it into
 * HTML the browser can trust. The law is SMALL PURPOSIVE SUBSET, exactly
 * stated (an undocumented token banks on nobody re-reading this file, so
 * the subset is the contract, never a wish):
 *
 *   #..######  headings                ```semantic fences```  code blocks
 *   - / * x    unordered lists         1. x     ordered lists
 *   > quote    blockquotes             --- / *** horizontal rules
 *   [text](https://…) links             ![alt](https://…) images
 *   **bold** / *italic* / `code` inline
 *   blank line = paragraph split
 *
 * Safety: the whole input is HTML-ESCAPED FIRST (a stray <tag> in prose
 * renders as ITS TEXT, never as markup — markdown carries zero trust),
 * then only the vocabulary above is rewritten into generated tags. Links
 * and images accept http(s) (+ mailto for links) ONLY: a javascript:
 * or data: target is dropped and the text stays plain — the renderer can
 * not mint a dangerous attribute because it only ever emits the tags in
 * this list with values it just escaped.
 *
 * One pass, no virtual DOM, no dependency. The result rides
 * dangerouslySetInnerHTML BY CONTRACT with the sanitizer upstream: md is
 * escaped-everything, the html lane is sanitized lib-side before render.
 */

/** Escape every HTML-significant byte: the markdown lane's foundation. */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** The one URL vet: http(s)+mailto only, nothing laughs back. */
function safeUrl(raw: string): string | null {
  const u = esc(raw.trim());
  if (/^https?:\/\//i.test(u)) return u;
  if (/^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(u)) return u;
  return null;
}

/** Inline vocabulary: code → bold → italic → images → links, in one pass. */
function inline(s: string): string {
  let out = esc(s);
  out = out.replace(/`([^`]+)`/g, (_m, c: string) => `<code>${c}</code>`);
  out = out.replace(/\*\*([^*\n]+)\*\*/g, (_m, b: string) => `<strong>${b}</strong>`);
  out = out.replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, (_m, pre: string, i: string) => `${pre}<em>${i}</em>`);
  out = out.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_m, alt: string, url: string) => {
    const u = safeUrl(url);
    return u ? `<img src="${u}" alt="${alt}" loading="lazy" />` : esc(alt);
  });
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, text: string, url: string) => {
    const u = safeUrl(url);
    return u ? `<a href="${u}" rel="noopener">${text}</a>` : text;
  });
  return out;
}

/** The block walker: fences first (they own their bytes), then the rest. */
export function renderMarkdown(md: string): string {
  const lines = md.replace(/\r\n?/g, "\n").split("\n");
  const blocks: string[] = [];
  let i = 0;
  let para: string[] = [];
  let list: { kind: "ul" | "ol"; items: string[] } | null = null;
  let quote: string[] = [];

  const flushPara = () => {
    if (para.length) {
      blocks.push(`<p>${para.map(inline).join("<br />")}</p>`);
      para = [];
    }
  };
  const flushList = () => {
    if (list) {
      blocks.push(`<${list.kind}>${list.items.map((t) => `<li>${inline(t)}</li>`).join("")}</${list.kind}>`);
      list = null;
    }
  };
  const flushQuote = () => {
    if (quote.length) {
      blocks.push(`<blockquote>${quote.map(inline).join("<br />")}</blockquote>`);
      quote = [];
    }
  };
  const flushAll = () => {
    flushPara();
    flushList();
    flushQuote();
  };

  while (i < lines.length) {
    const line = lines[i];

    // fenced code: the fence is exactly three backticks (an indent-prefixed
    // fence is prose, not code — the vocabulary is the subset, stated).
    const fence = line.match(/^```(\w*)\s*$/);
    if (fence) {
      flushAll();
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        body.push(lines[i]);
        i += 1;
      }
      i += 1; // step past the closing fence (or EOF — an unclosed fence is prose's problem)
      const lang = fence[1] ? ` class="language-${esc(fence[1])}"` : "";
      blocks.push(`<pre><code${lang}>${esc(body.join("\n"))}</code></pre>`);
      continue;
    }

    // blank line: everything open closes
    if (!line.trim()) {
      flushAll();
      i += 1;
      continue;
    }

    // heading
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      flushAll();
      const level = h[1].length;
      blocks.push(`<h${level}>${inline(h[2].trim())}</h${level}>`);
      i += 1;
      continue;
    }

    // horizontal rule
    if (/^\s*(?:-{3,}|\*{3,})\s*$/.test(line)) {
      flushAll();
      blocks.push("<hr />");
      i += 1;
      continue;
    }

    // blockquote
    const q = line.match(/^\s*>\s?(.*)$/);
    if (q) {
      flushPara();
      flushList();
      quote.push(q[1]);
      i += 1;
      continue;
    }

    // lists (one indent level: the subset keeps lander copy flat)
    const ul = line.match(/^\s*[-*]\s+(.*)$/);
    const ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (ul || ol) {
      flushPara();
      flushQuote();
      const kind: "ul" | "ol" = ul ? "ul" : "ol";
      const text = ul ? ul[1] : ol![1];
      if (!list || list.kind !== kind) {
        flushList();
        list = { kind, items: [] };
      }
      list.items.push(text);
      i += 1;
      continue;
    }

    flushList();
    flushQuote();
    para.push(line.trim());
    i += 1;
  }
  flushAll();
  return blocks.join("\n");
}
