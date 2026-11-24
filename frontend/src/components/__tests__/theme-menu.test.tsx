import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { posthog } from "../../lib/posthog";
import { ThemeMenu } from "../theme-menu";
import { ThemeProvider } from "../theme-provider";

const mockRouter = { replace: jest.fn() };
const mockSearchParams = new URLSearchParams();

jest.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
  useSearchParams: () => mockSearchParams,
}));

jest.mock("../../lib/posthog", () => ({
  posthog: {
    capture: jest.fn(),
  },
}));

const mockPosthog = posthog as jest.Mocked<typeof posthog>;

function renderMenu() {
  return render(
    <ThemeProvider>
      <ThemeMenu />
    </ThemeProvider>
  );
}

describe("ThemeMenu", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.localStorage.clear();
    delete document.documentElement.dataset.theme;
  });

  it.each([
    ["PostHog", "posthog"],
    ["Barbie", "barbie"],
  ])("applies and persists the %s theme", async (label, value) => {
    const user = userEvent.setup();
    renderMenu();

    const trigger = await screen.findByRole("button", { name: /daylight/i });
    await waitFor(() => expect(trigger).toBeEnabled());
    await user.click(trigger);
    await user.click(screen.getByRole("menuitemradio", { name: label }));

    await waitFor(() =>
      expect(document.documentElement.dataset.theme).toBe(value)
    );
    expect(window.localStorage.getItem("factoids-ui-theme")).toBe(value);
    expect(mockPosthog.capture).toHaveBeenCalledWith("theme_changed", {
      theme: value,
      previous_theme: "light",
    });
  });

  it("restores a stored theme on load", async () => {
    window.localStorage.setItem("factoids-ui-theme", "barbie");
    renderMenu();

    expect(
      await screen.findByRole("button", { name: /barbie/i })
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(document.documentElement.dataset.theme).toBe("barbie")
    );
  });

  it("does not capture when re-selecting the active theme", async () => {
    const user = userEvent.setup();
    renderMenu();

    const trigger = await screen.findByRole("button", { name: /daylight/i });
    await waitFor(() => expect(trigger).toBeEnabled());
    await user.click(trigger);
    await user.click(screen.getByRole("menuitemradio", { name: "Daylight" }));

    expect(mockPosthog.capture).not.toHaveBeenCalled();
  });
});
