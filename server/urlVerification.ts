/**
 * URL Verification Utility
 * 
 * Validates URLs before displaying them to users to prevent broken links.
 */

/**
 * Verify if a URL is accessible
 * @param url - The URL to verify
 * @param timeout - Request timeout in milliseconds (default: 5000)
 * @returns Promise<boolean> - true if URL is accessible, false otherwise
 */
export async function verifyUrl(url: string, timeout: number = 5000): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    const response = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ManusBot/1.0; +https://manus.im)'
      }
    });
    
    clearTimeout(timeoutId);
    
    // Consider 200-399 as valid
    return response.status >= 200 && response.status < 400;
  } catch (error) {
    // URL is not accessible
    return false;
  }
}

/**
 * Verify multiple URLs in parallel
 * @param urls - Array of URLs to verify
 * @param timeout - Request timeout in milliseconds (default: 5000)
 * @returns Promise<Map<string, boolean>> - Map of URL to verification result
 */
export async function verifyUrls(urls: string[], timeout: number = 5000): Promise<Map<string, boolean>> {
  const results = new Map<string, boolean>();
  
  const verificationPromises = urls.map(async (url) => {
    const isValid = await verifyUrl(url, timeout);
    results.set(url, isValid);
  });
  
  await Promise.all(verificationPromises);
  
  return results;
}

/**
 * Filter URLs to only include valid ones
 * @param urls - Array of URLs to filter
 * @param timeout - Request timeout in milliseconds (default: 5000)
 * @returns Promise<string[]> - Array of valid URLs
 */
export async function filterValidUrls(urls: string[], timeout: number = 5000): Promise<string[]> {
  const verificationResults = await verifyUrls(urls, timeout);
  
  return urls.filter(url => verificationResults.get(url) === true);
}
