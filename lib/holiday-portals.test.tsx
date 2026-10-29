import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// SSR contract only: render portal children inline to inspect inherited context.
// This does not claim browser focus-trap or visual QA.
vi.mock("@radix-ui/react-dialog", () => ({
  Root: "div",
  Trigger: "button",
  Close: "button",
  Overlay: "div",
  Content: "div",
  Title: "h2",
  Description: "p",
  Portal: ({ children }: { children: ReactNode }) => (
    <section data-test-portal="dialog">{children}</section>
  ),
}));
vi.mock("@radix-ui/react-popover", () => ({
  Root: "div",
  Trigger: "button",
  Content: ({
    sideOffset: _offset,
    ...props
  }: {
    sideOffset?: number;
    children?: ReactNode;
  }) => <div {...props} />,
  Portal: ({ children }: { children: ReactNode }) => (
    <section data-test-portal="popover">{children}</section>
  ),
}));
vi.mock("@radix-ui/react-select", () => ({
  Root: "div",
  Group: "div",
  Value: "span",
  Trigger: "button",
  Content: "div",
  Viewport: "div",
  Item: "div",
  Icon: "span",
  ItemIndicator: "span",
  ItemText: "span",
  Portal: ({ children }: { children: ReactNode }) => (
    <section data-test-portal="select">{children}</section>
  ),
}));

import { HolidayThemeProvider } from "@/components/holiday-theme";
import { DialogContent } from "@/components/ui/dialog";
import { PopoverContent } from "@/components/ui/popover";
import { SelectContent } from "@/components/ui/select";

describe("cabinet theme reaches all portal surfaces without global body changes", () => {
  it.each([
    { Content: DialogContent, slot: "dialog-content" },
    { Content: PopoverContent, slot: "popover-content" },
    { Content: SelectContent, slot: "select-content" },
  ])(
    "themes $slot and preserves passed content and attributes",
    ({ Content, slot }) => {
      const html = renderToStaticMarkup(
        <HolidayThemeProvider>
          <Content className="custom-class" aria-label="Проверка">
            Содержимое
          </Content>
        </HolidayThemeProvider>,
      );
      expect(html).toContain('data-slot="' + slot + '"');
      expect(html).toContain("holiday-theme holiday-portal");
      expect(html).toContain("custom-class");
      expect(html).toContain('aria-label="Проверка"');
      expect(html).toContain("Содержимое");
    },
  );
  it.each([
    { Content: DialogContent },
    { Content: PopoverContent },
    { Content: SelectContent },
  ])("leaves UI outside the cabinet theme unchanged", ({ Content }) => {
    const html = renderToStaticMarkup(<Content>Содержимое</Content>);
    expect(html).not.toContain("holiday-theme");
    expect(html).not.toContain("holiday-dialog-overlay");
  });
});
