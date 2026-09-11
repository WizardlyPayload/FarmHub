export type FieldFilterType = "all" | "harvest" | "needswork" | "growing" | "empty";

export type FieldStatus = "harvest" | "needswork" | "growing" | "empty";

export type ProgressBarModel = {
  pct: number;
  bg: string;
  label: string;
  textColour: string;
};

export type SoilBarModel = {
  progress: number;
  colour: string;
  label: string;
};

export type ForageBadge = {
  key: string;
  label: string;
  title: string;
  tone: "default" | "accent" | "warn" | "danger";
};

export type FleetLink = {
  roleId: string;
  roleLabel: string;
  vehicleName: string;
};

export type WeedBadgeModel = {
  label: string;
  tone: "default" | "accent" | "warn" | "danger";
  title: string;
};

export type SuggestionModel = {
  action: string;
  actionKey?: string;
  reason: string;
  seasonalNote: string;
  fleetLines: string[];
  fleetLinks: FleetLink[];
  buyLeaseLines: string[];
  otherToolLines: string[];
  showOrganicSkip: boolean;
  organicSkipKey: string;
};
