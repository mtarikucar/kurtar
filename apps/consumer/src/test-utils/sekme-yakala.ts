/**
 * A mailbox the mocked navigator writes its `screenOptions` into.
 *
 * `jest.mock`'s factory is hoisted above the test file's own declarations,
 * so it cannot close over a variable declared there — and the options
 * object is exactly what the tab-bar sizing suite is about. A module both
 * sides import is the way through.
 */
/** Only the fields this suite asserts on — the navigator's own option
 * type is not reachable from here without pulling in a dependency the app
 * does not declare. */
export interface SekmeSecenekleri {
  tabBarStyle: { height: number };
  tabBarLabel: (props: { color: string; children: string }) => {
    props: { numberOfLines: number };
  };
}

let sonSecenekler: SekmeSecenekleri | null = null;

export function yaz(secenekler: SekmeSecenekleri): void {
  sonSecenekler = secenekler;
}

export function oku(): SekmeSecenekleri {
  if (!sonSecenekler) throw new Error("sekme seçenekleri henüz yazılmadı");
  return sonSecenekler;
}
