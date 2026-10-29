import type { ReactElement, ReactNode } from "react";
import { Children, isValidElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Initial markup and the explicit pause control, without browser frame rendering.
const state = vi.hoisted(() => ({ paused: undefined as boolean | undefined }));
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useState: (initial: boolean) => {
    if (state.paused === undefined) state.paused = initial;
    return [
      state.paused,
      (next: boolean | ((current: boolean) => boolean)) => {
        state.paused = typeof next === "function" ? next(state.paused!) : next;
      },
    ];
  },
}));
vi.mock("lucide-react", () => ({
  Pause: () => <span aria-hidden="true" />,
  Play: () => <span aria-hidden="true" />,
}));
import { GarlandMapCanvas } from "@/components/garland-map-canvas";

function render() {
  const tree = GarlandMapCanvas({ children: <svg aria-label="Карта" /> });
  return { tree, html: renderToStaticMarkup(tree) };
}
function findButton(
  node: ReactNode,
): ReactElement<{ onClick: () => void }> | null {
  if (!isValidElement<{ children?: ReactNode }>(node)) return null;
  if (node.type === "button")
    return node as ReactElement<{ onClick: () => void }>;
  for (const child of Children.toArray(node.props.children)) {
    const found = findButton(child);
    if (found) return found;
  }
  return null;
}
function toggle() {
  const button = findButton(render().tree);
  if (!button) throw new Error("Missing garland pause control");
  button.props.onClick();
}

beforeEach(() => {
  state.paused = undefined;
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("garland playback enabled on initial page load", () => {
  it("starts enabled in the initial markup without an activation effect", () => {
    const { html } = render();
    expect(html).toContain('aria-label="Карта"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("Пауза");
    expect(html).not.toContain("garland-map-paused");
  });
  it("does not gate playback on visibility observers or system preferences", () => {
    const preference = vi.fn().mockReturnValue({ matches: true });
    const observer = vi.fn();
    vi.stubGlobal("window", { matchMedia: preference });
    vi.stubGlobal("document", { hidden: true });
    vi.stubGlobal("IntersectionObserver", observer);
    const { html } = render();
    expect(html).toContain('aria-pressed="true"');
    expect(html).not.toContain("garland-map-paused");
    expect(preference).not.toHaveBeenCalled();
    expect(observer).not.toHaveBeenCalled();
  });
  it("pauses only by an explicit click and resumes from the same control", () => {
    render();
    toggle();
    expect(render().html).toContain("garland-map-paused");
    expect(render().html).toContain('aria-pressed="false"');
    expect(render().html).toContain("Включить огоньки");
    toggle();
    expect(render().html).not.toContain("garland-map-paused");
    expect(render().html).toContain('aria-pressed="true"');
  });
});
