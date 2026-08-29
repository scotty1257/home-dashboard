import type { HomeCommand, HomeSnapshot } from "@home-dashboard/contracts";

/** Provider boundary for smart-home control. Demo provider runs with no config. */
export interface HomeProvider {
  readonly name: "home-assistant" | "demo";
  snapshot(): Promise<HomeSnapshot>;
  execute(command: HomeCommand): Promise<void>;
}
