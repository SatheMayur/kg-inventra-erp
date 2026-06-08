/**
 * GitHub Integration Configuration
 * Centralized settings for remote data synchronization and authentication.
 */

export const GITHUB_CONFIG = {
  OWNER: 'yiwodoy-source',
  REPO: 'Store_KG',
  BRANCH: 'main',
  
  // URLs for direct fetching from raw content
  get RAW_BASE_URL() {
    return `https://raw.githubusercontent.com/${this.OWNER}/${this.REPO}/${this.BRANCH}`;
  },
  
  // File paths for synchronization
  FILES: {
    INVENTORY: 'inventory.csv',
    USERS: 'users.json',
    ITEMS: 'items.json',
  }
};

/**
 * Returns the raw URL for a specific file in the repository.
 */
export function getGitHubRawUrl(fileName: string): string {
  return `${GITHUB_CONFIG.RAW_BASE_URL}/${fileName}`;
}
