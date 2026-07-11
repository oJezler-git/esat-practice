import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { DataManagementSection } from "./DataManagementSection";
import {
  clearAllData,
  clearProgressData,
  generateConfirmationPhrase,
} from "../lib/dataManagement";

vi.mock("../lib/dataManagement", () => ({
  clearAllData: vi.fn(),
  clearProgressData: vi.fn(),
  generateConfirmationPhrase: vi.fn(),
}));

const navigateMock = vi.fn();
// Injected so the component's delayed reload timer never hits
// window.location.reload(), which jsdom cannot perform.
const reloadMock = vi.fn();

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

function renderSection() {
  return render(
    <MemoryRouter>
      <DataManagementSection reloadPage={reloadMock} />
    </MemoryRouter>,
  );
}

describe("DataManagementSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    navigateMock.mockClear();
    vi.mocked(clearAllData).mockResolvedValue(undefined);
    vi.mocked(clearProgressData).mockResolvedValue(undefined);
    vi.mocked(generateConfirmationPhrase).mockReturnValue("alpha bravo charlie");
    vi.spyOn(window, "setTimeout");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("opens and closes the destructive clear-all modal", () => {
    renderSection();

    fireEvent.click(screen.getByRole("button", { name: "Clear All" }));

    expect(screen.getByText("Clear everything?")).toBeInTheDocument();
    expect(screen.getByText("alpha bravo charlie")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByText("Clear everything?")).not.toBeInTheDocument();
  });

  it("keeps clear-all disabled until the confirmation phrase matches", async () => {
    renderSection();

    fireEvent.click(screen.getByRole("button", { name: "Clear All" }));
    const confirmButton = screen.getAllByRole("button", { name: "Clear All" }).at(-1);
    expect(confirmButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Confirmation phrase"), {
      target: { value: "alpha bravo" },
    });
    expect(confirmButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Confirmation phrase"), {
      target: { value: "alpha bravo charlie" },
    });
    expect(confirmButton).toBeEnabled();

    fireEvent.click(confirmButton!);

    await waitFor(() => {
      expect(clearAllData).toHaveBeenCalled();
      expect(screen.getByText("All data cleared. Reloading...")).toBeInTheDocument();
    });
    expect(window.setTimeout).toHaveBeenCalledWith(expect.any(Function), 1500);
  });

  it("shows an error message when clear-all fails", async () => {
    vi.mocked(clearAllData).mockRejectedValue(new Error("IndexedDB blocked"));
    renderSection();

    fireEvent.click(screen.getByRole("button", { name: "Clear All" }));
    fireEvent.change(screen.getByLabelText("Confirmation phrase"), {
      target: { value: "alpha bravo charlie" },
    });
    fireEvent.click(screen.getAllByRole("button", { name: "Clear All" }).at(-1)!);

    expect(await screen.findByText("Error: IndexedDB blocked")).toBeInTheDocument();
    expect(window.setTimeout).not.toHaveBeenCalledWith(expect.any(Function), 1500);
  });

  it("confirms progress clear and schedules a delayed reload on success", async () => {
    renderSection();

    fireEvent.click(screen.getByRole("button", { name: "Clear" }));

    expect(screen.getByText("Clear progress data?")).toBeInTheDocument();
    expect(screen.getByText(/clear your practice statistics/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Clear Progress" }));

    await waitFor(() => {
      expect(clearProgressData).toHaveBeenCalled();
      expect(screen.getByText("Progress data cleared. Reloading...")).toBeInTheDocument();
    });
    expect(window.setTimeout).toHaveBeenCalledWith(expect.any(Function), 1500);
  });

  it("closes the progress-clear modal without clearing", () => {
    renderSection();

    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByText("Clear progress data?")).not.toBeInTheDocument();
    expect(clearProgressData).not.toHaveBeenCalled();
  });
});
