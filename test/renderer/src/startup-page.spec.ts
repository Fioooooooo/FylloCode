import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("static startup page", () => {
  const html = readFileSync(resolve(process.cwd(), "src/renderer/startup.html"), "utf8");
  const rendererHtml = readFileSync(resolve(process.cwd(), "src/renderer/index.html"), "utf8");
  const mainCss = readFileSync(resolve(process.cwd(), "src/renderer/src/assets/main.css"), "utf8");
  const css = readFileSync(resolve(process.cwd(), "src/renderer/src/assets/startup.css"), "utf8");

  it("uses only the generated icon and static startup stylesheet", () => {
    expect(html).toContain('src="/icon.svg"');
    expect(html).toContain('href="/src/assets/startup.css"');
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<path");
    expect(html).not.toContain("<style");
  });

  it("exposes status semantics and disables animation for reduced motion", () => {
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('aria-busy="true"');
    expect(css).toContain("prefers-reduced-motion: reduce");
    expect(css).toMatch(/prefers-reduced-motion[\s\S]*animation:\s*none/);
  });

  it("uses themed startup colors without fake percentage text", () => {
    expect(css).toContain("--fyllo-startup-accent: oklch(70.4% 0.14 182.503)");
    expect(css).toContain("--fyllo-startup-accent: oklch(77.7% 0.152 181.912)");
    expect(css).toContain("--fyllo-startup-wordmark: #0f172a");
    expect(css).toContain("--fyllo-startup-wordmark: #e2e8f0");
    expect(html).not.toMatch(/\d+%/);
  });

  it("centers the shared dot-matrix startup lockup", () => {
    expect(css).toMatch(/\.fyllo-startup-content\s*{[\s\S]*position:\s*absolute/);
    expect(css).toMatch(/\.fyllo-startup-content\s*{[\s\S]*inset:\s*0/);
    expect(css).toMatch(/\.fyllo-startup-content\s*{[\s\S]*place-items:\s*center/);
    expect(html.match(/fyllo-startup-dot-band/g)).toHaveLength(6);
    expect(html).toContain('<span class="fyllo-startup-wordmark">FylloCode</span>');
    expect(html).toContain('<span class="fyllo-startup-status">正在启动…</span>');
    expect(css).toMatch(/\.fyllo-startup-ring\s*{[\s\S]*width:\s*144px/);
    expect(css).toMatch(/\.fyllo-startup-ring\s*{[\s\S]*height:\s*126px/);
    expect(css).toContain("background-size: 8px 8px");
    expect(css).toMatch(/\.fyllo-startup-dot-base\s*{[\s\S]*opacity:\s*0\.32/);
  });

  it("uses a restrained opacity sweep with a delayed static-page status", () => {
    expect(css).toContain("radial-gradient(");
    expect(css).toContain("animation: fyllo-startup-dot-wave 2.2s infinite");
    expect(css).toContain("animation: fyllo-startup-status-reveal 0.35s ease-out 0.8s forwards");
    expect(css).not.toContain("fyllo-startup-orbit");
    expect(css).not.toContain("fyllo-startup-pulse");
    expect(css).not.toContain("conic-gradient(");
    expect(css).not.toContain("drop-shadow(");
  });

  it("uses the generated icon mask with a static fallback", () => {
    expect(css).toContain('-webkit-mask: url("/icon.svg") center / contain no-repeat');
    expect(css).toContain('mask: url("/icon.svg") center / contain no-repeat');
    expect(css).toContain('@supports not ((-webkit-mask: url("/icon.svg"))');
    expect(css).toMatch(/@supports not[\s\S]*\.fyllo-startup-dot-logo\s*{[\s\S]*display:\s*none/);
    expect(css).toMatch(/@supports not[\s\S]*\.fyllo-startup-logo\s*{[\s\S]*display:\s*block/);
  });

  it("keeps an equivalent startup shell visible while the Vue entry is loading", () => {
    expect(rendererHtml).toContain('<link rel="stylesheet" href="/src/assets/startup.css"');
    expect(rendererHtml).toContain('<div id="app">');
    expect(rendererHtml).toContain('class="fyllo-startup-overlay"');
    expect(rendererHtml.match(/fyllo-startup-dot-band/g)).toHaveLength(6);
    expect(rendererHtml).toContain('<span class="fyllo-startup-wordmark">FylloCode</span>');
    expect(rendererHtml).toContain('<span class="fyllo-startup-status">正在启动…</span>');
    expect(rendererHtml).toContain('src="/icon.svg"');
    expect(rendererHtml.indexOf('href="/src/assets/startup.css"')).toBeLessThan(
      rendererHtml.indexOf('src="/src/main.ts"')
    );
    expect(mainCss).not.toContain('@import "./startup.css"');
  });
});
