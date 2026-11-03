import { describe, expect, it } from "vitest";
import { renderMarkdown } from "../src/lib/lilmd";

/**
 * lilmd pins (wave 19.28): the homebrew markdown renderer's subset is the
 * contract — headings, lists, fences, quotes, rules, inline vocabulary,
 * and the escape-everything law (markdown carries zero HTML trust; a
 * weekly <script> in copy renders as ITS TEXT).
 */
describe("lilmd: the lander renderer's laws", () => {
  it("escapes hostile markup in prose before anything renders", () => {
    const out = renderMarkdown("<script>alert(1)</script> & <img src=x onerror=y>");
    expect(out).toContain("&lt;script&gt;");
    expect(out).not.toContain("<script");
    expect(out).toContain("&amp;");
  });

  it("renders the stated vocabulary: headings, rules, quotes, both lists", () => {
    const out = renderMarkdown(
      ["# Title", "", "> quoted", "", "- one", "- two", "", "1. first", "2. second", "", "---"].join("\n"),
    );
    expect(out).toContain("<h1>Title</h1>");
    expect(out).toContain("<blockquote>quoted</blockquote>");
    expect(out).toContain("<ul><li>one</li><li>two</li></ul>");
    expect(out).toContain("<ol><li>first</li><li>second</li></ol>");
    expect(out).toContain("<hr />");
  });

  it("fenced code keeps its bytes escaped and closes itself", () => {
    const out = renderMarkdown("```js\nconst a = \"<b>\";\n```");
    expect(out).toContain("<pre>");
    expect(out).toContain("&quot;&lt;b&gt;&quot;");
    expect(out).toContain('class="language-js"');
  });

  it("inline vocabulary: code, bold, italics, links, images", () => {
    const out = renderMarkdown("run `vant` — **bold** and *italic*");
    expect(out).toContain("<code>vant</code>");
    expect(out).toContain("<strong>bold</strong>");
    expect(out).toContain("<em>italic</em>");
    const link = renderMarkdown("[hooks](https://vant.site/docs)");
    expect(link).toContain('<a href="https://vant.site/docs" rel="noopener">hooks</a>');
    const img = renderMarkdown("![logo](https://vant.site/logo.png)");
    expect(img).toContain('<img src="https://vant.site/logo.png"');
  });

  it("vetoes non-http(s) targets: javascript:/data: stay plain text", () => {
    const out = renderMarkdown("[click](javascript:alert(1))");
    expect(out).not.toContain("</a>");
    expect(out).toContain("click");
    expect(out).not.toContain("javascript:");
  });

  it("paragraphs split on blank lines; soft breaks ride <br />", () => {
    const out = renderMarkdown("line one\nline two\n\npara two");
    expect(out).toContain("line one<br />line two");
    expect(out).toContain("<p>para two</p>");
  });
});
