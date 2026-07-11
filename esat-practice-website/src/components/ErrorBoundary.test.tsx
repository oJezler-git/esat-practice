import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorBoundary } from "./ErrorBoundary";

let shouldThrow = false;

function MaybeThrowingChild() {
  if (shouldThrow) {
    throw new Error("Test child exploded");
  }

  return <div>Healthy child</div>;
}

describe("ErrorBoundary", () => {
  beforeEach(() => {
    shouldThrow = false;
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders children when no error occurs", () => {
    render(
      <ErrorBoundary>
        <MaybeThrowingChild />
      </ErrorBoundary>,
    );

    expect(screen.getByText("Healthy child")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Something went wrong" })).not.toBeInTheDocument();
    expect(console.error).not.toHaveBeenCalled();
  });

  it("catches a thrown child error and shows accessible fallback UI", () => {
    shouldThrow = true;

    render(
      <ErrorBoundary>
        <MaybeThrowingChild />
      </ErrorBoundary>,
    );

    expect(screen.getByRole("heading", { name: "Something went wrong" })).toBeInTheDocument();
    expect(screen.getByText("An unexpected error occurred. You can try again or reload the page.")).toBeInTheDocument();
    expect(screen.getByText("Test child exploded")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reload page" })).toBeInTheDocument();
    expect(console.error).toHaveBeenCalledWith(
      "ErrorBoundary caught:",
      expect.any(Error),
      expect.stringContaining("MaybeThrowingChild"),
    );
  });

  it("clears the error and rerenders children from the retry button", () => {
    shouldThrow = true;

    render(
      <ErrorBoundary>
        <MaybeThrowingChild />
      </ErrorBoundary>,
    );

    shouldThrow = false;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(screen.getByText("Healthy child")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Something went wrong" })).not.toBeInTheDocument();
  });

  it("runs the reload action from the secondary fallback button", () => {
    const reloadPage = vi.fn();
    shouldThrow = true;

    render(
      <ErrorBoundary reloadPage={reloadPage}>
        <MaybeThrowingChild />
      </ErrorBoundary>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Reload page" }));

    expect(reloadPage).toHaveBeenCalledOnce();
  });
});
