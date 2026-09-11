const {
  parseI3dFieldOutlines,
  downsampleOutline,
  scoreMapI3dPath,
  stripTerrainTransformGroups,
} = require("../mapFieldOutlines.cjs");

describe("mapFieldOutlines i3d parse", () => {
  const fixture = `<?xml version="1.0"?>
<i3D>
  <Scene>
    <TransformGroup name="fields" nodeId="10">
      <TransformGroup name="field70" translation="586 140 -821.5" nodeId="11">
        <TransformGroup name="polygonPoints" nodeId="12">
          <TransformGroup name="point1" nodeId="13"/>
          <TransformGroup name="point2" translation="100 0 0" nodeId="14"/>
          <TransformGroup name="point3" translation="100 0 50" nodeId="15"/>
          <TransformGroup name="point4" translation="0 0 50" nodeId="16"/>
        </TransformGroup>
      </TransformGroup>
    </TransformGroup>
  </Scene>
</i3D>`;

  test("world-space rectangle from field translation + local points", () => {
    const fields = parseI3dFieldOutlines(fixture);
    expect(fields).toHaveLength(1);
    expect(fields[0].id).toBe(70);
    expect(fields[0].outline).toEqual([
      [586, -821.5],
      [686, -821.5],
      [686, -771.5],
      [586, -771.5],
    ]);
  });

  test("ignores TransformGroups outside Scene", () => {
    const xml = `<?xml version="1.0"?>
<i3D>
  <Shapes>
    <TransformGroup name="fields" translation="5000 0 5000">
      <TransformGroup name="field1" translation="0 0 0">
        <TransformGroup name="polygonPoints">
          <TransformGroup name="point1"/>
          <TransformGroup name="point2" translation="1 0 0"/>
          <TransformGroup name="point3" translation="1 0 1"/>
        </TransformGroup>
      </TransformGroup>
    </TransformGroup>
  </Shapes>
  <Scene>
    <TransformGroup name="fields">
      <TransformGroup name="field70" translation="586 140 -821.5">
        <TransformGroup name="polygonPoints">
          <TransformGroup name="point1"/>
          <TransformGroup name="point2" translation="100 0 0"/>
          <TransformGroup name="point3" translation="100 0 50"/>
          <TransformGroup name="point4" translation="0 0 50"/>
        </TransformGroup>
      </TransformGroup>
    </TransformGroup>
  </Scene>
</i3D>`;
    const fields = parseI3dFieldOutlines(xml);
    expect(fields).toHaveLength(1);
    expect(fields[0].id).toBe(70);
    expect(fields[0].outline[0]).toEqual([586, -821.5]);
  });

  test("downsample keeps first/last and stays under cap", () => {
    const many = Array.from({ length: 80 }, (_, i) => [i, i * 2]);
    const compact = downsampleOutline(many, 32);
    expect(compact.length).toBeLessThanOrEqual(33);
    expect(compact[0]).toEqual([0, 0]);
  });

  test("rdp keeps rectangle corners instead of a dense edge walk", () => {
    const pts = [];
    for (let i = 0; i <= 24; i++) pts.push([i, 0]);
    for (let i = 1; i <= 24; i++) pts.push([24, i]);
    for (let i = 23; i >= 0; i--) pts.push([i, 24]);
    for (let i = 23; i >= 1; i--) pts.push([0, i]);
    const compact = downsampleOutline(pts, 32);
    expect(compact.length).toBeGreaterThanOrEqual(4);
    expect(compact.length).toBeLessThanOrEqual(8);
  });

  test("parses field nodes without a fields parent and applies Y rotation", () => {
    const xml = `<?xml version="1.0"?>
<i3D>
  <Scene>
    <TransformGroup name="field1" translation="10 0 20" rotation="0 90 0">
      <TransformGroup name="polygonPoints">
        <TransformGroup name="a"/>
        <TransformGroup name="b" translation="100 0 0"/>
        <TransformGroup name="c" translation="100 0 50"/>
      </TransformGroup>
    </TransformGroup>
  </Scene>
</i3D>`;
    const fields = parseI3dFieldOutlines(xml);
    expect(fields).toHaveLength(1);
    expect(fields[0].id).toBe(1);
    expect(fields[0].outline[0]).toEqual([10, 20]);
    expect(fields[0].outline[1][0]).toBeCloseTo(10, 5);
    expect(fields[0].outline[1][1]).toBeCloseTo(120, 5);
  });

  test("parses Field01 with polygonIndex skipping nameIndicator", () => {
    const xml = `<?xml version="1.0"?>
<i3D>
  <Scene>
    <TransformGroup name="fields" onCreate="FieldUtil.onCreate">
      <TransformGroup name="Field01" translation="10 0 20">
        <UserAttribute>
          <Attribute name="polygonIndex" type="integer" value="1"/>
        </UserAttribute>
        <TransformGroup name="nameIndicator" translation="50 0 50"/>
        <TransformGroup name="verts">
          <TransformGroup name="a"/>
          <TransformGroup name="b" translation="100 0 0"/>
          <TransformGroup name="c" translation="100 0 50"/>
        </TransformGroup>
      </TransformGroup>
    </TransformGroup>
  </Scene>
</i3D>`;
    const fields = parseI3dFieldOutlines(xml);
    expect(fields).toHaveLength(1);
    expect(fields[0].id).toBe(1);
    expect(fields[0].outline).toEqual([
      [10, 20],
      [110, 20],
      [110, 70],
    ]);
  });

  test("parses FieldUtil children that are not named fieldN", () => {
    const xml = `<?xml version="1.0"?>
<i3D>
  <Scene>
    <TransformGroup name="farmlandFields">
      <UserAttribute>
        <Attribute name="onCreate" type="scriptCallback" value="FieldUtil.onCreate"/>
      </UserAttribute>
      <TransformGroup name="plotWheat" translation="0 0 0">
        <TransformGroup name="polygonPoints">
          <TransformGroup name="p1"/>
          <TransformGroup name="p2" translation="10 0 0"/>
          <TransformGroup name="p3" translation="10 0 10"/>
        </TransformGroup>
      </TransformGroup>
    </TransformGroup>
  </Scene>
</i3D>`;
    const fields = parseI3dFieldOutlines(xml);
    expect(fields).toHaveLength(1);
    expect(fields[0].outline).toHaveLength(3);
    expect(fields[0].outline[1]).toEqual([10, 0]);
  });
});

describe("scoreMapI3dPath", () => {
  test("picks the map scene over cutter, trees, and placeables", () => {
    expect(scoreMapI3dPath("map/map.i3d", 400_000)).toBeGreaterThan(
      scoreMapI3dPath("map/config/cutter/linseed/linseed_greenBig.i3d", 9_000_000)
    );
    expect(scoreMapI3dPath("maps/map.i3d", 800_000)).toBeGreaterThan(
      scoreMapI3dPath("maps/placeables/productions/mapleSapProduction/mapleSapProduction.i3d", 12_000_000)
    );
    expect(scoreMapI3dPath("mapUS/mapUS.i3d", 1_000_000)).toBeGreaterThan(
      scoreMapI3dPath("map/FS22Trees/pineNew/pine_stage03.i3d", 8_000_000)
    );
    expect(scoreMapI3dPath("map.i3d", 200_000)).toBeGreaterThan(0);
    expect(scoreMapI3dPath("maps/effects/mower/mower.i3d", 5_000_000)).toBe(-1);
    expect(scoreMapI3dPath("map/BRCsounds.i3d", 2_000_000)).toBe(-1);
    expect(scoreMapI3dPath("maps/carpathianCountrysideMap.i3d", 4_000_000)).toBeGreaterThan(
      scoreMapI3dPath("effects/cutter/rye/rye_greenBig.i3d", 9_000_000)
    );
    expect(scoreMapI3dPath("Settlers_map.i3d", 3_000_000)).toBeGreaterThan(0);
  });
});

describe("stripTerrainTransformGroups", () => {
  test("drops terrain so later field nodes remain", () => {
    const xml = `<Scene>
      <TerrainTransformGroup name="terrain">PADDING</TerrainTransformGroup>
      <TransformGroup name="fields"/>
    </Scene>`;
    const stripped = stripTerrainTransformGroups(xml);
    expect(stripped).not.toMatch(/PADDING/);
    expect(stripped).toMatch(/name="fields"/);
  });
});
