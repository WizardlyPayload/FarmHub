/** FS25 1.20 MapOverlayGenerator and Farm colors, converted from linear RGB to CSS sRGB. */
function channel(value: number): number {
  const c = Math.max(0, Math.min(1, value));
  const srgb = c > 0.0031308 ? 1.055 * c ** (1 / 2.4) - 0.055 : 12.92 * c;
  return Math.round(srgb * 255);
}

export function gameMapColor(rgb: readonly [number, number, number], alpha = 0.52): string {
  return `rgba(${channel(rgb[0])}, ${channel(rgb[1])}, ${channel(rgb[2])}, ${alpha})`;
}

const FARM_SINGLEPLAYER: readonly [number, number, number] = [0.22323, 0.40724, 0.00368];
const FARM_MULTIPLAYER: ReadonlyArray<readonly [number, number, number]> = [
  [1, 0.4287, 0], [1, 0.1221, 0.0003], [0.7084, 0.0203, 0.2086],
  [0.2541, 0.0065, 0.5089], [0.1921, 0.0976, 0.8632],
  [0.1248, 0.2541, 1], [0.1248, 0.9216, 1], [0.2307, 1, 0.2232],
];

export function gameFarmColor(colorIndex: unknown, multiplayer: boolean): string {
  const index = Number(colorIndex);
  const color = multiplayer && Number.isInteger(index) && index >= 1 && index <= FARM_MULTIPLAYER.length
    ? FARM_MULTIPLAYER[index - 1] : FARM_SINGLEPLAYER;
  return gameMapColor(color, 1);
}

export const GAME_MAP_COLORS = {
  growing: [
    [0.227, 0.5711, 0.0176], [0.1683, 0.4678, 0.0152],
    [0.1221, 0.3813, 0.013], [0.0823, 0.3006, 0.011],
    [0.0529, 0.2346, 0.0091], [0.0296, 0.1746, 0.0075],
    [0.0144, 0.1248, 0.006], [0.0048, 0.0844, 0.0048],
  ],
  harvest: [0.7758, 0.3095, 0.013],
  fertilized1: [0.0595, 0.2086, 0.8227],
  fertilized2: [0.0018, 0.0382, 0.2961],
  needsPlowing: [0.6172, 0.051, 0.051],
  needsLime: [0.0815, 0.6584, 0.4198],
  needsRolling: [0.0967, 0.3758, 0.7084],
  mulched: [0.0908, 0.0467, 0.0865],
  watered: [0.0967, 0.3758, 0.7084],
} as const;
