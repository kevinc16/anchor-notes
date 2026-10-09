import { describe, expect, it, vi } from 'vitest';
import {
  FIREFOX_REMOTE_DATA_COLLECTION,
  requestFirefoxDataCollectionPermission,
  type FirefoxDataCollectionApi,
} from '../lib/firefox-permissions';

function createApi() {
  const api: FirefoxDataCollectionApi = {
    request: vi.fn().mockResolvedValue(true),
  };
  return api;
}

describe('requestFirefoxDataCollectionPermission', () => {
  it('does not touch the permissions API for Chrome builds', async () => {
    const api = createApi();

    await expect(requestFirefoxDataCollectionPermission(api, false)).resolves.toBe(true);
    expect(api.request).not.toHaveBeenCalled();
  });

  it('requests both data categories directly from Firefox', async () => {
    const api = createApi();

    await expect(requestFirefoxDataCollectionPermission(api, true)).resolves.toBe(true);
    expect(api.request).toHaveBeenCalledWith({ data_collection: FIREFOX_REMOTE_DATA_COLLECTION });
  });

  it('blocks remote organization when Firefox denies consent', async () => {
    const deniedApi = createApi();
    vi.mocked(deniedApi.request).mockResolvedValue(false);
    await expect(requestFirefoxDataCollectionPermission(deniedApi, true)).resolves.toBe(false);
  });

  it('blocks remote organization when built-in consent is unavailable', async () => {
    const failingApi = createApi();
    vi.mocked(failingApi.request).mockRejectedValue(new Error('permission API unavailable'));
    await expect(requestFirefoxDataCollectionPermission(failingApi, true)).resolves.toBe(false);
  });
});
