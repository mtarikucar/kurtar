import { fireEvent, render, screen } from "@testing-library/react-native";

const mockReplace = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn(), back: jest.fn() }),
}));

import NotFoundScreen from "../app/+not-found";
import "../i18n";

// [M4 fix] apps/consumer/src/app/+not-found.tsx did not exist before this
// fix — an unmatched deep link fell through to expo-router's unbranded
// default screen instead of this app's usual branded empty state.
describe("NotFoundScreen — branded catch-all for an unmatched route (M4)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders branded copy and a CTA back to the app's home", async () => {
    await render(<NotFoundScreen />);

    expect(screen.getByText("Bu sayfa bulunamadı")).toBeTruthy();
    await fireEvent.press(screen.getByText("Ana sayfaya dön"));
    expect(mockReplace).toHaveBeenCalledWith("/(tabs)");
  });
});
