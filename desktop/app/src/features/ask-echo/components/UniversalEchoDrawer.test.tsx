// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { EchoAIProvider } from "./EchoAI";
import { UniversalEchoDrawer } from "./UniversalEchoDrawer";

afterEach(cleanup);
// jsdom has no scrollIntoView; the chat scrolls to its newest message with it.
Element.prototype.scrollIntoView = vi.fn();

// The drawer is a resizable dock around the Claude chat (EchoAI). Outside the desktop app there is
// no Claude bridge, so the chat explains that instead of offering a prompt.
function renderDrawer(onClose = vi.fn()) {
  render(<EchoAIProvider><UniversalEchoDrawer isOpen onClose={onClose} meetings={[]} /></EchoAIProvider>);
  return onClose;
}

describe("UniversalEchoDrawer", () => {
  it("opens the Claude chat dock and explains when Claude is not available", async () => {
    renderDrawer();
    expect(screen.getByRole("region", { name: "Ask Echo · Claude" })).toBeTruthy();
    expect(await screen.findByText("Echo AI is available in the Mosaic desktop app.")).toBeTruthy();
    expect((screen.getByLabelText("Message Echo AI") as HTMLTextAreaElement).disabled).toBe(true);
  });

  it("closes from the header button", () => {
    const onClose = renderDrawer();
    fireEvent.click(screen.getByRole("button", { name: "Close Ask Echo" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("resizes with the keyboard within its limits", () => {
    renderDrawer();
    const handle = screen.getByRole("separator", { name: "Resize Ask Echo panel" });
    const start = Number(handle.getAttribute("aria-valuenow"));
    fireEvent.keyDown(handle, { key: "ArrowLeft" });
    expect(Number(handle.getAttribute("aria-valuenow"))).toBe(start + 16);
    fireEvent.keyDown(handle, { key: "End" });
    expect(handle.getAttribute("aria-valuenow")).toBe("360");
  });
});
