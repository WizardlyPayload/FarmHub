const {
  normalizeHttpPath,
  isPublicUnauthenticatedGetPath,
  isLanSensitiveHttpPath,
  maySkipLanBasicForGet,
} = require('../lanHttpPath.cjs');

describe('lanHttpPath', () => {
  test('normalizes case and trailing slashes', () => {
    expect(normalizeHttpPath('/API/servers')).toBe('/api/servers');
    expect(normalizeHttpPath('/api/data/')).toBe('/api/data');
    expect(normalizeHttpPath('/API/lan-ws-token/?x=1')).toBe('/api/lan-ws-token');
  });

  test('sensitive uppercase and trailing-slash variants still require auth', () => {
    for (const p of ['/API/servers', '/api/servers/', '/API/data', '/api/lan-ws-token/']) {
      expect(isLanSensitiveHttpPath(p)).toBe(true);
      expect(maySkipLanBasicForGet(p, false)).toBe(false);
      expect(maySkipLanBasicForGet(p, true)).toBe(false);
    }
  });

  test('/api/status remains public', () => {
    expect(isPublicUnauthenticatedGetPath('/API/status')).toBe(true);
    expect(maySkipLanBasicForGet('/api/status', false)).toBe(true);
  });
});
