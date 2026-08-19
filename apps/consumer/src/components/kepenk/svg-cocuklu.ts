import type { ComponentType, ReactNode } from "react";
import { Defs as RNDefs, Pattern as RNPattern } from "react-native-svg";

/**
 * `<Defs>` and `<Pattern>` with their children typed.
 *
 * This app's tsconfig sets `moduleSuffixes: [".native", ".web", ""]` (for
 * the MapPane split), so TypeScript resolves react-native-svg's WEB
 * declarations — and there `Defs`/`Pattern` extend `WebShape` with no
 * `children` in their props, even though both are container elements on
 * every platform and the runtime accepts them. The casts are confined to
 * this file so no component has to carry one.
 */

export const Defs = RNDefs as unknown as ComponentType<{ children?: ReactNode }>;

export interface DesenOzellikleri {
  id: string;
  x?: number;
  y?: number;
  width: number;
  height: number;
  patternUnits?: "userSpaceOnUse" | "objectBoundingBox";
  patternContentUnits?: "userSpaceOnUse" | "objectBoundingBox";
  patternTransform?: string;
  children?: ReactNode;
}

export const Pattern = RNPattern as unknown as ComponentType<DesenOzellikleri>;
