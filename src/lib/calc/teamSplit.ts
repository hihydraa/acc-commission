import Decimal from "decimal.js";
import { roundHalfUp2 } from "./rounding";

/** Spec §4.6 default split for สาขาสามทอง/โลจิสติกส์ — stored as config so other
 *  branches (phase 2) can have their own percentages (spec §6 commission_config). */
export interface TeamSplitConfig {
  manager: number; // 0.10
  sales: number; // 0.60 (เจ้าหน้าที่การตลาด / เจ้าของยอด) — informational only, see note below
  admin: number; // 0.20
  central: number; // 0.10
}

export const DEFAULT_TEAM_SPLIT: TeamSplitConfig = {
  manager: 0.1,
  sales: 0.6,
  admin: 0.2,
  central: 0.1,
};

export interface TeamSplitResult {
  net: number;
  manager: number;
  admin: number;
  central: number;
  /** "เจ้าหน้าที่การตลาด" — receives the remainder (net - manager - admin -
   *  central), NOT round(net * 0.60). Rounding all four shares independently
   *  can drift the total by ±0.01 vs. net (spec §4.4); giving marketing the
   *  remainder guarantees manager + admin + central + sales === net exactly. */
  sales: number;
}

export function splitTeam(netRounded: number, config: TeamSplitConfig = DEFAULT_TEAM_SPLIT): TeamSplitResult {
  const net = new Decimal(netRounded);
  const manager = roundHalfUp2(net.times(config.manager));
  const admin = roundHalfUp2(net.times(config.admin));
  const central = roundHalfUp2(net.times(config.central));
  const sales = roundHalfUp2(net.minus(manager).minus(admin).minus(central));
  return { net: netRounded, manager, admin, central, sales };
}
