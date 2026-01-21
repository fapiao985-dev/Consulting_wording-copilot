/**
 * Web Search Service for Market Wording Copilot
 * 
 * This service provides real web search functionality to find authoritative
 * industry research reports with valid URLs.
 * 
 * Search Strategy based on PDF Research Report Solution:
 * - Pattern 1: [行业] 深度报告 PDF
 * - Pattern 2: [行业] 行业白皮书 PDF
 * - Pattern 3: [行业] 竞争格局 PDF
 * - Pattern 4: [行业] 消费者 市场分析 PDF
 * - Pattern 5: [龙头企业] 商业模式 分析 PDF
 */

// Authority source hierarchy for validation
export const AUTHORITY_SOURCES = {
  tier1_domestic: {
    names: ["广发证券", "天风证券", "国金证券", "中信证券", "招商证券", "华泰证券", "国海证券", "东方证券", "东北证券", "国泰君安"],
    domains: ["dfcfw.com", "tfzq.com", "gjzq.com", "citics.com", "cmschina.com", "htsc.com.cn", "ghzq.com.cn", "nesc.cn"],
    score: 90
  },
  tier2_foreign: {
    names: ["Morgan Stanley", "Goldman Sachs", "JP Morgan", "Bank of America", "Credit Suisse", "UBS", "Citi"],
    domains: ["morganstanley.com", "goldmansachs.com", "jpmorgan.com", "bankofamerica.com", "credit-suisse.com"],
    score: 75
  },
  tier3_consulting: {
    names: ["艾瑞咨询", "灼识咨询", "CIC", "久谦咨询", "艺恩咨询", "德勤", "Deloitte", "麦肯锡", "McKinsey", "BCG", "贝恩", "Bain"],
    domains: ["iresearch.com.cn", "cninsights.com", "deloitte.com", "mckinsey.com", "bcg.com"],
    score: 60
  },
  tier4_research: {
    names: ["华经情报网", "共研网", "智研咨询", "观研报告网", "中国报告网", "Euromonitor", "Statista", "IBISWorld"],
    domains: ["huaon.com", "gonyn.com", "chyxx.com", "chinabaogao.com", "euromonitor.com", "statista.com"],
    score: 40
  }
};

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  source: string;
  sourceTier: number;
  authorityScore: number;
  publicationDate?: string;
  isPDF: boolean;
}

/**
 * Generate search queries based on industry name
 */
export function generateSearchQueries(industryName: string, keywords: string[] = []): string[] {
  const queries: string[] = [];
  
  // Pattern 1: Basic industry research
  queries.push(`${industryName} 深度报告 PDF`);
  queries.push(`${industryName} 行业白皮书 PDF`);
  queries.push(`${industryName} 竞争格局 PDF`);
  
  // Pattern 2: Market analysis
  queries.push(`${industryName} 消费者 市场分析 PDF`);
  queries.push(`${industryName} 商业模式 盈利 PDF`);
  queries.push(`${industryName} 下沉市场 竞争 PDF`);
  
  // Pattern 3: Trends
  queries.push(`${industryName} 发展趋势 2024 2025 PDF`);
  queries.push(`${industryName} 市场规模 预测 PDF`);
  
  // Pattern 4: Additional keywords
  for (const keyword of keywords) {
    queries.push(`${industryName} ${keyword} PDF`);
  }
  
  return queries;
}

/**
 * Calculate authority score for a URL
 */
export function calculateAuthorityScore(url: string, title: string): { score: number; tier: number; source: string } {
  try {
    const urlObj = new URL(url);
    const domain = urlObj.hostname.toLowerCase();
    
    // Check each tier
    for (const [tierKey, tierData] of Object.entries(AUTHORITY_SOURCES)) {
      // Check domain match
      for (const sourceDomain of tierData.domains) {
        if (domain.includes(sourceDomain)) {
          const tier = parseInt(tierKey.replace(/\D/g, '')) || 4;
          const sourceName = tierData.names.find(name => 
            title.includes(name) || domain.includes(name.toLowerCase())
          ) || tierData.names[0];
          return { score: tierData.score, tier, source: sourceName };
        }
      }
      
      // Check title match for source names
      for (const sourceName of tierData.names) {
        if (title.includes(sourceName)) {
          const tier = parseInt(tierKey.replace(/\D/g, '')) || 4;
          return { score: tierData.score, tier, source: sourceName };
        }
      }
    }
    
    // Unknown source
    return { score: 20, tier: 5, source: "Other" };
  } catch {
    return { score: 10, tier: 5, source: "Unknown" };
  }
}

/**
 * Check if URL is a PDF
 */
export function isPDFUrl(url: string): boolean {
  const lowerUrl = url.toLowerCase();
  return lowerUrl.includes('.pdf') || lowerUrl.includes('pdf');
}

/**
 * Validate search result quality
 */
export function validateSearchResult(result: SearchResult): boolean {
  // Exclude pure catalogs
  const catalogIndicators = ["目录", "章节", "目次", "索引", "目录表", "纯目录"];
  if (catalogIndicators.some(indicator => result.title.includes(indicator))) {
    return false;
  }
  
  // Exclude news articles
  const newsIndicators = ["新闻", "快讯", "资讯", "news", "press release"];
  if (newsIndicators.some(indicator => result.title.toLowerCase().includes(indicator))) {
    return false;
  }
  
  // Exclude earnings releases
  const earningsIndicators = ["财报", "earnings", "quarterly report", "annual report"];
  if (earningsIndicators.some(indicator => result.title.toLowerCase().includes(indicator))) {
    return false;
  }
  
  // Prefer PDFs
  if (!result.isPDF) {
    return result.authorityScore >= 60; // Only accept non-PDFs from high authority sources
  }
  
  return result.authorityScore >= 30; // Accept PDFs from most sources
}

/**
 * Extract source name from title or URL
 */
export function extractSourceName(title: string, url: string): string {
  // Check for known sources in title
  for (const tierData of Object.values(AUTHORITY_SOURCES)) {
    for (const name of tierData.names) {
      if (title.includes(name)) {
        return name;
      }
    }
  }
  
  // Extract from URL domain
  try {
    const urlObj = new URL(url);
    const domain = urlObj.hostname.replace('www.', '').split('.')[0];
    return domain.charAt(0).toUpperCase() + domain.slice(1);
  } catch {
    return "Unknown";
  }
}

/**
 * Extract publication year from title or snippet
 */
export function extractPublicationYear(title: string, snippet: string): string | undefined {
  const text = `${title} ${snippet}`;
  
  // Look for year patterns
  const yearPatterns = [
    /20(2[0-6]|1[0-9])年/,
    /20(2[0-6]|1[0-9])/,
    /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d{1,2}, 20(2[0-6]|1[0-9])/i
  ];
  
  for (const pattern of yearPatterns) {
    const match = text.match(pattern);
    if (match) {
      const yearMatch = match[0].match(/20\d{2}/);
      if (yearMatch) {
        return yearMatch[0];
      }
    }
  }
  
  return undefined;
}

/**
 * Format search results for display
 */
export function formatSearchResultsForCitation(results: SearchResult[]): string {
  return results.map((result, index) => {
    const yearStr = result.publicationDate ? ` (${result.publicationDate})` : '';
    const pdfIndicator = result.isPDF ? ' [PDF]' : '';
    
    return `[${result.source}]${yearStr}${pdfIndicator}
Title: ${result.title}
URL: ${result.url}
Insight: ${result.snippet}
Authority: Tier ${result.sourceTier} (Score: ${result.authorityScore})`;
  }).join('\n\n---\n\n');
}
