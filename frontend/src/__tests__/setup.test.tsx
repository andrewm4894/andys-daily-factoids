import { render, screen } from "@/test-utils";

// Simple test to verify Jest and React Testing Library are working
describe("Test Setup", () => {
  it("should render a simple component", () => {
    render(<div>Hello, testing world!</div>);
    expect(screen.getByText("Hello, testing world!")).toBeInTheDocument();
  });

  it("should have access to testing utilities", () => {
    expect(screen).toBeDefined();
    expect(render).toBeDefined();
  });

  it("should have mocked navigation", async () => {
    const { useRouter } = await import("next/navigation");
    const router = useRouter();
    expect(router.push).toBeDefined();
    expect(typeof router.push).toBe("function");
  });
});
