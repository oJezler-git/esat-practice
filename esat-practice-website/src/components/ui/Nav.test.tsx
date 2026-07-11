import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { Nav } from "./Nav";

function renderNav(route = "/", isHidden?: boolean) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <Nav isHidden={isHidden} />
    </MemoryRouter>,
  );
}

describe("Nav", () => {
  beforeEach(() => {
    // Keep requestAnimationFrame real so the pill spring loop is untouched;
    // fake only the clock-driven timers and Date for the countdown.
    vi.useFakeTimers({
      toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders every section link twice (desktop bar + mobile menu source)", () => {
    renderNav("/");
    for (const label of ["Home", "Practice", "Bank", "Revision", "Progress", "History", "Settings"]) {
      expect(screen.getByRole("link", { name: label })).toBeInTheDocument();
    }
    expect(screen.getByRole("link", { name: "ESAT practice — home" })).toBeInTheDocument();
  });

  it("marks only the current route's link as active", () => {
    renderNav("/practice");

    expect(screen.getByRole("link", { name: "Practice" })).toHaveClass("nav-link-active");
    expect(screen.getByRole("link", { name: "Home" })).toHaveClass("nav-link-idle");
    // Home uses end matching, so it is only active on exactly "/".
    expect(screen.getByRole("link", { name: "Bank" })).toHaveClass("nav-link-idle");
  });

  it("treats Home as active only on the exact root path", () => {
    renderNav("/");
    expect(screen.getByRole("link", { name: "Home" })).toHaveClass("nav-link-active");
  });

  it("shows whole days until 12 October, rolling to next year after it passes", () => {
    vi.setSystemTime(new Date(2026, 6, 11)); // 11 July 2026
    const { unmount } = renderNav("/");
    expect(screen.getByText("93")).toBeInTheDocument(); // 20 + 31 + 30 + 12
    unmount();

    vi.setSystemTime(new Date(2026, 9, 12)); // exam day itself counts as 0
    const { unmount: unmount2 } = renderNav("/");
    expect(screen.getByText("0")).toBeInTheDocument();
    unmount2();

    vi.setSystemTime(new Date(2026, 9, 13)); // day after → next year's exam
    renderNav("/");
    expect(screen.getByText("364")).toBeInTheDocument();
  });

  it("hides the shell when isHidden is set", () => {
    const { container } = renderNav("/", true);
    expect(container.querySelector("nav")).toHaveClass("nav-shell-hidden");
  });

  it("opens the mobile menu, closes it after the exit animation", () => {
    const { container } = renderNav("/");

    const hamburger = screen.getByRole("button", { name: "Open menu" });
    fireEvent.click(hamburger);

    expect(container.querySelector(".mobile-menu-overlay")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close menu" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );

    fireEvent.click(screen.getByRole("button", { name: "Close menu" }));
    // Closing state keeps the overlay mounted for the 300ms exit animation.
    expect(container.querySelector(".mobile-menu-closing")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(container.querySelector(".mobile-menu-overlay")).not.toBeInTheDocument();
  });

  it("closes the mobile menu when a mobile link is clicked", () => {
    const { container } = renderNav("/");
    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));

    const mobileLinks = container.querySelectorAll(".mobile-nav-link");
    expect(mobileLinks).toHaveLength(7);
    fireEvent.click(mobileLinks[1]);

    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(container.querySelector(".mobile-menu-overlay")).not.toBeInTheDocument();
  });
});
