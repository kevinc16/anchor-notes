/* global URL, console, process */

import { readFile, access } from 'node:fs/promises';

const manifestPath = new URL('../.output/firefox-mv2/manifest.json', import.meta.url);
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const gecko = manifest.browser_specific_settings?.gecko;
const dataCollection = gecko?.data_collection_permissions;
const failures = [];

if (manifest.manifest_version !== 2) failures.push('manifest_version must be 2');
if (!gecko?.id) failures.push('browser_specific_settings.gecko.id is missing');
if (gecko?.strict_min_version !== '140.0') failures.push('Firefox minimum version must be 140.0');
if (!dataCollection?.required?.includes('none')) failures.push('Firefox required data permission must include none');
if (!dataCollection?.optional?.includes('browsingActivity')) {
  failures.push('Firefox optional data permissions must include browsingActivity');
}
if (!dataCollection?.optional?.includes('websiteContent')) {
  failures.push('Firefox optional data permissions must include websiteContent');
}
if (manifest.host_permissions) failures.push('MV2 Firefox output must move host permissions into permissions');
if (!manifest.permissions?.includes('<all_urls>')) failures.push('Firefox permissions must include <all_urls>');
if (!manifest.background?.scripts?.includes('background.js')) failures.push('Firefox background script is missing');
if (manifest.browser_action?.default_popup !== 'popup.html') failures.push('Firefox browser action popup is missing');

if (manifest.mime_types_handler) failures.push('Opt-in PDF support must not register a MIME handler');
for (const asset of ['pdf.html', 'pdfjs/web/viewer.html', 'pdfjs/web/viewer.mjs', 'pdfjs/build/pdf.worker.mjs', 'pdfjs/LICENSE']) {
  try { await access(new URL(`../.output/firefox-mv2/${asset}`, import.meta.url)); }
  catch { failures.push(`Missing bundled PDF asset: ${asset}`); }
}

if (failures.length > 0) {
  console.error('Firefox build validation failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log('Firefox build manifest validated.');
}
