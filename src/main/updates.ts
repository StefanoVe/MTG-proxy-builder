const repository = 'StefanoVe/mtg-proxy-builder';
const latestReleaseEndpoint = `https://api.github.com/repos/${repository}/releases/latest`;
export const releasesURL = `https://github.com/${repository}/releases`;

// Published GitHub tags include the workflow run number after the app version.
const releaseVersionPattern = /^v?(\d+\.\d+\.\d+)(?:-build\.\d+)?$/;

export async function checkForUpdate(installedVersion: string): Promise<string | null> {
  try {
    const response = await fetch(latestReleaseEndpoint, {
      headers: { Accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(5000)
    });
    if (!response.ok) return null;
    const release = await response.json();
    if (release?.draft || release?.prerelease || typeof release?.tag_name !== 'string') return null;
    const published = releaseVersionPattern.exec(release.tag_name)?.[1];
    const installed = releaseVersionPattern.exec(installedVersion)?.[1];
    if (!published || !installed) return null;

    const current = installed.split('.').map(Number);
    for (const [index, part] of published.split('.').map(Number).entries()) {
      if (part !== current[index]) return part > current[index] ? published : null;
    }
  } catch {
    // A failed update check should never interrupt opening the editor.
  }
  return null;
}
