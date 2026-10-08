export const FIREFOX_REMOTE_DATA_COLLECTION = ['browsingActivity', 'websiteContent'] as const;

export interface FirefoxDataCollectionApi {
  request(details: { data_collection: readonly (typeof FIREFOX_REMOTE_DATA_COLLECTION)[number][] }): Promise<boolean>;
}

export async function requestFirefoxDataCollectionPermission(
  api: FirefoxDataCollectionApi,
  isFirefox = import.meta.env.FIREFOX,
): Promise<boolean> {
  if (!isFirefox) return true;

  try {
    // Request directly from the settings button so Firefox receives the user gesture.
    return await api.request({ data_collection: FIREFOX_REMOTE_DATA_COLLECTION });
  } catch {
    // Firefox versions before the built-in data-consent API reject this field. The
    // explicit remote-organizer toggle remains the consent fallback there.
    return true;
  }
}
