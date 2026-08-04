import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("static startup page", () => {
  const html = readFileSync(resolve(process.cwd(), "src/renderer/startup.html"), "utf8");
  const css = readFileSync(resolve(process.cwd(), "src/renderer/src/assets/startup.css"), "utf8");

  it("uses only the generated icon and static startup stylesheet", () => {
    expect(html).toContain('src="/icon.svg"');
    expect(html).toContain('href="/src/assets/startup.css"');
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<path");
  });

  it("exposes status semantics and disables animation for reduced motion", () => {
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('aria-busy="true"');
    expect(css).toContain("prefers-reduced-motion: reduce");
    expect(css).toMatch(/prefers-reduced-motion[\s\S]*animation:\s*none/);
  });

  it("uses a high-contrast teal progress accent without fake percentage text", () => {
    expect(css).toContain("--fyllo-startup-accent: oklch(70.4% 0.14 182.503)");
    expect(css).toContain("--fyllo-startup-accent: oklch(77.7% 0.152 181.912)");
    expect(css).toContain("color-mix(");
    expect(html).not.toMatch(/\d+%/);
  });

  it("centers the logo and renders a restrained meteor orbit", () => {
    expect(css).toMatch(/\.fyllo-startup-content\s*{[\s\S]*position:\s*absolute/);
    expect(css).toMatch(/\.fyllo-startup-content\s*{[\s\S]*inset:\s*0/);
    expect(css).toMatch(/\.fyllo-startup-content\s*{[\s\S]*place-items:\s*center/);
    expect(css).toContain("conic-gradient(");
    expect(css).toContain("radial-gradient(");
    expect(css).toContain("animation: fyllo-startup-orbit");
    expect(css).toMatch(/\.fyllo-startup-logo\s*{[\s\S]*margin-top:\s*10px/);
  });
});
