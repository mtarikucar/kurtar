import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";
import type { ReactTestRendererJSON } from "react-test-renderer";
import { AccessibilityInfo } from "react-native";

/**
 * The global mock in jest.setup.ts stands `MapView`/`Marker` in as plain
 * `View`s, which is enough for a screen that merely mounts a map — but
 * both of the defects in this file live on the IMPERATIVE handle
 * (`animateToRegion`, `redraw`), which a plain View has no way to record.
 * This mock forwards a ref and writes every imperative call down.
 */
jest.mock("react-native-maps", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require("react");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require("react-native");
  const kayit = {
    animateToRegion: jest.fn(),
    redraw: jest.fn(),
  };
  const MapView = React.forwardRef(
    (props: { children?: ReactNode }, ref: React.Ref<unknown>) => {
      React.useImperativeHandle(ref, () => ({ animateToRegion: kayit.animateToRegion }));
      return React.createElement(View, props, props.children);
    },
  );
  const Marker = React.forwardRef(
    (props: { children?: ReactNode; accessibilityLabel?: string }, ref: React.Ref<unknown>) => {
      React.useImperativeHandle(ref, () => ({
        redraw: () => kayit.redraw(props.accessibilityLabel),
      }));
      return React.createElement(View, props, props.children);
    },
  );
  return { __esModule: true, default: MapView, Marker, PROVIDER_GOOGLE: "google", kayit };
});

/** One cluster chip and one price chip on screen, so both marker paths
 * are exercised. The global mock returns an empty index. */
jest.mock("supercluster", () => {
  class SahteSupercluster {
    load() {
      return this;
    }
    getClusters() {
      return [
        {
          type: "Feature",
          geometry: { type: "Point", coordinates: [29.02, 40.98] },
          properties: { cluster: true, cluster_id: 7, point_count: 4 },
        },
        {
          type: "Feature",
          geometry: { type: "Point", coordinates: [29.03, 40.99] },
          properties: {
            pin: { storeId: "store-1", lat: 40.99, lng: 29.03, minPriceCents: 6900 },
          },
        },
      ];
    }
    getClusterExpansionZoom() {
      return 14;
    }
  }
  return { __esModule: true, default: SahteSupercluster };
});

import { MapPane } from "../components/MapPane.native";
import { DistrictPicker } from "../components/DistrictPicker";
import { ClockProvider } from "../design/saat";
import { ThemeProvider } from "../design/theme";
import { m, type Faz } from "../design/tokens";
import type { DiscoveryMapPin } from "../lib/api-types";
import "../i18n";

const { kayit } = jest.requireMock("react-native-maps") as {
  kayit: { animateToRegion: jest.Mock; redraw: jest.Mock };
};

const SABIT_ZAMAN = new Date("2026-08-19T19:00:00.000Z");
const KUME_ETIKETI = "4 mağaza — yakınlaştırmak için dokun";
const PIN_ETIKETI = "Mağaza, 69₺'den başlayan fiyatlarla";
const SECILI_PIN_ETIKETI = "Seçili, 69₺'den başlayan fiyatlarla";

const PINLER: DiscoveryMapPin[] = [
  { storeId: "store-1", lat: 40.99, lng: 29.03, minPriceCents: 6900 } as DiscoveryMapPin,
];

const BOLGE = {
  latitude: 40.99,
  longitude: 29.03,
  latitudeDelta: 0.22,
  longitudeDelta: 0.22,
};

/** Pins the platform's answer to the reduce-motion question. The hook
 * subscribes AND reads once, so both have to be controlled. */
function hareketiAyarla(azalt: boolean) {
  jest
    .spyOn(AccessibilityInfo, "isReduceMotionEnabled")
    .mockImplementation(() => Promise.resolve(azalt));
  jest
    .spyOn(AccessibilityInfo, "addEventListener")
    .mockImplementation((() => ({ remove: jest.fn() })) as unknown as typeof AccessibilityInfo.addEventListener);
}

function Sahne({ faz, secili }: { faz: Faz; secili: string | null }) {
  return (
    <ClockProvider sabitZaman={SABIT_ZAMAN}>
      <ThemeProvider fazZorla={faz}>
        <MapPane
          pins={PINLER}
          initialRegion={BOLGE}
          onRegionChangeComplete={() => undefined}
          onPinPress={() => undefined}
          onSwitchToList={() => undefined}
          selectedStoreId={secili}
        />
      </ThemeProvider>
    </ClockProvider>
  );
}

function sar(cocuk: ReactNode) {
  return render(
    <ClockProvider sabitZaman={SABIT_ZAMAN}>
      <ThemeProvider fazZorla="gece">{cocuk}</ThemeProvider>
    </ClockProvider>,
  );
}

function hostBul(
  dugum: ReactTestRendererJSON | ReactTestRendererJSON[] | null,
  kosul: (d: ReactTestRendererJSON) => boolean,
): ReactTestRendererJSON[] {
  if (!dugum) return [];
  if (Array.isArray(dugum)) return dugum.flatMap((d) => hostBul(d, kosul));
  const bulunan = kosul(dugum) ? [dugum] : [];
  for (const cocuk of dugum.children ?? []) {
    if (typeof cocuk !== "string") bulunan.push(...hostBul(cocuk, kosul));
  }
  return bulunan;
}

beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(() => {
  jest.restoreAllMocks();
});

/**
 * DENETİM #15 — tapping a cluster drove the whole viewport through a
 * 300ms pan-and-zoom. A self-driving full-screen camera move is one of
 * the strongest vestibular triggers there is, and this was the only
 * motion left in the map surface that never asked about the preference —
 * everything else there is deliberately a discrete state change. The
 * duration was also an inline literal, invisible to `design/motion.ts`
 * and to the §5 grep test.
 */
describe("Map camera — the cluster zoom asks first (denetim #15)", () => {
  it("takes m.fast, §1.3's own map token, when motion is allowed", async () => {
    hareketiAyarla(false);
    const ekran = await sar(<Sahne faz="gece" secili={null} />);
    await act(async () => undefined);

    await fireEvent.press(screen.getByLabelText(KUME_ETIKETI));

    expect(kayit.animateToRegion).toHaveBeenCalledTimes(1);
    const [bolge, sure] = kayit.animateToRegion.mock.calls[0];
    expect(bolge).toMatchObject({ latitude: 40.98, longitude: 29.02 });
    expect(sure).toBe(m.fast);
    await ekran.unmount();
  });

  it("recentres instantly — duration 0, which both natives treat as a jump — when reduce motion is on", async () => {
    hareketiAyarla(true);
    const ekran = await sar(<Sahne faz="gece" secili={null} />);
    await act(async () => undefined);

    await fireEvent.press(screen.getByLabelText(KUME_ETIKETI));

    // The end state still carries what the motion carried: the map is on
    // the cluster either way, it just does not fly there.
    expect(kayit.animateToRegion).toHaveBeenCalledTimes(1);
    const [bolge, sure] = kayit.animateToRegion.mock.calls[0];
    expect(bolge).toMatchObject({ latitude: 40.98, longitude: 29.02 });
    expect(sure).toBe(0);
    await ekran.unmount();
  });
});

/**
 * DENETİM #25 — an Android Custom-View marker is a bitmap snapshot that
 * only refreshes while `tracksViewChanges` is true. `setIzle(false)` in
 * `onLayout` is idempotent and a colour change moves nothing, so the
 * bitmap froze at first layout: tapping a pin produced no visible
 * selection at all, and every pin kept its daylight fill for the rest of
 * the session after the palette crossed into gece.
 */
describe("Map markers — a discrete re-snapshot on a discrete change (denetim #25)", () => {
  it("re-snapshots the price chip when it becomes the selected pin", async () => {
    hareketiAyarla(false);
    const ekran = await sar(<Sahne faz="gece" secili={null} />);
    await act(async () => undefined);
    expect(screen.getByLabelText(PIN_ETIKETI)).toBeTruthy();

    kayit.redraw.mockClear();
    await ekran.rerender(<Sahne faz="gece" secili="store-1" />);
    await act(async () => undefined);

    // The chip now asks for the sodium fill, the dark ink and the 8pt
    // lift — none of which reaches the screen without this.
    expect(screen.getByLabelText(SECILI_PIN_ETIKETI)).toBeTruthy();
    expect(kayit.redraw).toHaveBeenCalledWith(SECILI_PIN_ETIKETI);
    await ekran.unmount();
  });

  it("re-snapshots both the price chip and the cluster chip when the phase turns over", async () => {
    hareketiAyarla(false);
    const ekran = await sar(<Sahne faz="gunduz" secili={null} />);
    await act(async () => undefined);

    kayit.redraw.mockClear();
    await ekran.rerender(<Sahne faz="gece" secili={null} />);
    await act(async () => undefined);

    const yenidenCizilen = kayit.redraw.mock.calls.map((cagri) => cagri[0]);
    expect(yenidenCizilen).toContain(PIN_ETIKETI);
    expect(yenidenCizilen).toContain(KUME_ETIKETI);
    await ekran.unmount();
  });

  it("still leaves tracksViewChanges off after first layout — no continuous snapshotting, no flicker", async () => {
    hareketiAyarla(false);
    const ekran = await sar(<Sahne faz="gece" secili={null} />);
    await act(async () => undefined);

    const cip = screen.getByLabelText(PIN_ETIKETI).children[0];
    if (typeof cip === "string") throw new Error("beklenmeyen metin düğümü");
    await fireEvent(cip, "layout", { nativeEvent: { layout: { width: 56, height: 28 } } });

    // redraw() is the escape hatch precisely BECAUSE snapshotting stays
    // off — leaving it on is the classic Android marker flicker.
    expect(screen.getByLabelText(PIN_ETIKETI).props.tracksViewChanges).toBe(false);
    await ekran.unmount();
  });
});

/**
 * DENETİM #14 — the district sheet is the recovery path for a user who
 * denied location, including a user who turned reduce motion on. It was
 * the one moving surface in the app that never consulted the preference
 * at all: a sheet up to 70% of the screen height flew up from the bottom
 * on every open and back down on every dismissal.
 */
describe("District picker — the sheet does not fly (denetim #14)", () => {
  function modalDugumu(agac: ReactTestRendererJSON | ReactTestRendererJSON[] | null) {
    const bulunan = hostBul(agac, (d) => d.props?.animationType !== undefined);
    expect(bulunan).toHaveLength(1);
    return bulunan[0];
  }

  it("slides when motion is allowed", async () => {
    hareketiAyarla(false);
    const ekran = await sar(
      <DistrictPicker visible onSelect={() => undefined} onClose={() => undefined} />,
    );
    await waitFor(() => expect(modalDugumu(ekran.toJSON()).props.animationType).toBe("slide"));
    await ekran.unmount();
  });

  it("appears in place when reduce motion is on, with the same sheet underneath", async () => {
    hareketiAyarla(true);
    const ekran = await sar(
      <DistrictPicker visible onSelect={() => undefined} onClose={() => undefined} />,
    );
    await waitFor(() => expect(modalDugumu(ekran.toJSON()).props.animationType).toBe("none"));
    // The end state carries everything the motion did: same title, same
    // list, same contact edge.
    expect(screen.getByText("İlçe seç")).toBeTruthy();
    expect(screen.getByText("Kadıköy")).toBeTruthy();
    await ekran.unmount();
  });
});
