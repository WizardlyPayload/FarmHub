import { Card } from "@/components/ui";
import { tOr } from "@/i18n/i18n";
import {
  ModEmpty, ModPage, ModStatTiles, ModTable, asList, formatNumber, num,
  useCompanionPage, type CompanionPageProps, type ModStatTile,
} from "@/sections/mods/shared";

const K = "companionPage.flockCamera";

type Camera = {
  farmId?: number;
  placeableId?: string;
  name?: string;
  ledMode?: number;
  alertMode?: number;
  fallen?: boolean;
  events?: string[];
};

function ledMode(value: unknown): string {
  switch (num(value)) {
    case 0: return tOr(`${K}.off`, "Off");
    case 1: return tOr(`${K}.on`, "On");
    case 2: return tOr(`${K}.activity`, "Activity");
    default: return "—";
  }
}

function alertMode(value: unknown): string {
  switch (num(value)) {
    case 0: return tOr(`${K}.off`, "Off");
    case 1: return tOr(`${K}.allVehicles`, "All vehicles");
    case 2: return tOr(`${K}.otherFarms`, "Other farms");
    default: return "—";
  }
}

export function Page({ entry }: CompanionPageProps) {
  const { page, farmData, farmId } = useCompanionPage(entry.key);
  const cameras = asList<Camera>(page?.rows).filter((row) => num(row.farmId) === farmId);
  const tiles: ModStatTile[] = farmData ? [
    { key: "cameras", label: tOr(`${K}.cameras`, "Owned cameras"), value: formatNumber(farmData.cameraCount, 0) },
  ] : [];

  return (
    <ModPage entry={entry} lead={tOr(`${K}.lead`, "Operating state and recorded notices from this farm's placed cameras. The mod stamps new notices with game day and time; this is not a video feed or a speed violation record.")}>
      <ModStatTiles tiles={tiles} />
      <Card title={tOr(`${K}.title`, "Camera status")}>
        <ModTable columns={[
          { key: "camera", label: tOr(`${K}.camera`, "Camera") },
          { key: "status", label: tOr(`${K}.status`, "Status") },
          { key: "led", label: tOr(`${K}.led`, "LED") },
          { key: "alerts", label: tOr(`${K}.alerts`, "Alerts") },
          { key: "events", label: tOr(`${K}.events`, "Saved events"), align: "end" },
        ]} rows={cameras.map((camera, index) => ({
          key: camera.placeableId || String(index),
          cells: {
            camera: camera.name || "Flock Camera",
            status: camera.fallen === true ? tOr(`${K}.fallen`, "Fallen") : tOr(`${K}.standing`, "Standing"),
            led: ledMode(camera.ledMode),
            alerts: alertMode(camera.alertMode),
            events: formatNumber(asList<string>(camera.events).length, 0),
          },
        }))} empty={tOr(`${K}.empty`, "No owned Flock Camera state is available.")} />
      </Card>
      {cameras.map((camera, index) => {
        const events = asList<string>(camera.events);
        return events.length > 0 ? (
          <Card key={camera.placeableId || String(index)} title={`${camera.name || "Flock Camera"} — ${tOr(`${K}.history`, "Recorded events")}`}>
            <ModTable columns={[
              { key: "number", label: "#", align: "end" },
              { key: "event", label: tOr(`${K}.event`, "Event") },
            ]} rows={events.map((event, eventIndex) => ({
              key: String(eventIndex),
              cells: { number: formatNumber(eventIndex + 1, 0), event },
            }))} empty={tOr(`${K}.noEvents`, "No recorded events.")} />
          </Card>
        ) : null;
      })}
      {page?.coverage === "truncated" ? <ModEmpty>{tOr(`${K}.truncated`, "Only part of the camera state is shown.")}</ModEmpty> : null}
      {page?.readState === "partial" ? <ModEmpty>{tOr(`${K}.partial`, "Camera state could not be read safely; values were withheld.")}</ModEmpty> : null}
    </ModPage>
  );
}
