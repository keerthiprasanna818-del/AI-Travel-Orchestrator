import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { TransportSelect } from "@/components/transport-select";

const OPTIONS = ["Flights", "Trains", "Bus", "Any"];

function Harness({ initial = "Flights" }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <div>
      <TransportSelect options={OPTIONS} value={value} onChange={setValue} />
      <output data-testid="value">{value}</output>
    </div>
  );
}

describe("TransportSelect", () => {
  it("selects Flights on the very first click", async () => {
    const user = userEvent.setup();
    render(<Harness initial="" />);
    await user.click(screen.getByRole("radio", { name: "Flights" }));
    expect(screen.getByTestId("value")).toHaveTextContent("Flights");
    expect(screen.getByRole("radio", { name: "Flights" })).toHaveAttribute("aria-checked", "true");
  });

  it("switches Trains → Flights without an intermediate click", async () => {
    const user = userEvent.setup();
    render(<Harness initial="Trains" />);
    await user.click(screen.getByRole("radio", { name: "Trains" }));
    expect(screen.getByTestId("value")).toHaveTextContent("Trains");
    await user.click(screen.getByRole("radio", { name: "Flights" }));
    expect(screen.getByTestId("value")).toHaveTextContent("Flights");
    expect(screen.getByRole("radio", { name: "Trains" })).toHaveAttribute("aria-checked", "false");
  });

  it("keeps exactly one option selected at a time", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("radio", { name: "Bus" }));
    const checked = screen
      .getAllByRole("radio")
      .filter((el) => el.getAttribute("aria-checked") === "true");
    expect(checked).toHaveLength(1);
    expect(checked[0]).toHaveAccessibleName("Bus");
  });

  it("selects when the label text or icon inside the option is clicked", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const option = screen.getByRole("radio", { name: "Trains" });
    const inner = option.querySelector("span") ?? option;
    await user.click(inner as Element);
    expect(screen.getByTestId("value")).toHaveTextContent("Trains");
  });

  it("supports keyboard selection with Enter and Space", async () => {
    const user = userEvent.setup();
    render(<Harness initial="" />);
    screen.getByRole("radio", { name: "Flights" }).focus();
    await user.keyboard("{Enter}");
    expect(screen.getByTestId("value")).toHaveTextContent("Flights");

    screen.getByRole("radio", { name: "Bus" }).focus();
    await user.keyboard(" ");
    expect(screen.getByTestId("value")).toHaveTextContent("Bus");
  });

  it("emits one change per click (no stale state)", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<TransportSelect options={OPTIONS} value="Trains" onChange={onChange} />);
    await user.click(screen.getByRole("radio", { name: "Flights" }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("Flights");
  });

  it("handles mobile-style taps", async () => {
    render(<Harness initial="" />);
    (screen.getByRole("radio", { name: "Any" }) as HTMLButtonElement).click();
    expect(await screen.findByText("Any", { selector: "output" })).toBeInTheDocument();
  });
});
