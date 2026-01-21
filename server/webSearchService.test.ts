import { describe, it, expect } from "vitest";
import {
  generateSearchQueries,
  calculateAuthorityScore,
  isPDFUrl,
  validateSearchResult,
  extractSourceName,
  extractPublicationYear,
  type SearchResult
} from "./webSearchService";

describe("webSearchService", () => {
  describe("generateSearchQueries", () => {
    it("generates correct search queries for an industry", () => {
      const queries = generateSearchQueries("现制咖啡");
      
      expect(queries).toContain("现制咖啡 深度报告 PDF");
      expect(queries).toContain("现制咖啡 行业白皮书 PDF");
      expect(queries).toContain("现制咖啡 竞争格局 PDF");
      expect(queries).toContain("现制咖啡 消费者 市场分析 PDF");
      expect(queries.length).toBeGreaterThanOrEqual(8);
    });

    it("includes additional keywords when provided", () => {
      const queries = generateSearchQueries("咖啡", ["瑞幸", "星巴克"]);
      
      expect(queries).toContain("咖啡 瑞幸 PDF");
      expect(queries).toContain("咖啡 星巴克 PDF");
    });
  });

  describe("calculateAuthorityScore", () => {
    it("returns high score for tier 1 domestic sources", () => {
      const result = calculateAuthorityScore(
        "https://pdf.dfcfw.com/pdf/report.pdf",
        "中信证券咖啡行业深度报告"
      );
      
      expect(result.score).toBe(90);
      expect(result.tier).toBe(1);
    });

    it("returns medium score for tier 3 consulting sources", () => {
      const result = calculateAuthorityScore(
        "https://www.iresearch.com.cn/report.pdf",
        "艾瑞咨询行业报告"
      );
      
      expect(result.score).toBe(60);
      expect(result.tier).toBe(3);
    });

    it("returns low score for unknown sources", () => {
      const result = calculateAuthorityScore(
        "https://unknown-site.com/report.pdf",
        "Some random report"
      );
      
      expect(result.score).toBeLessThan(30);
      expect(result.tier).toBe(5);
    });

    it("identifies source from title when domain is unknown", () => {
      const result = calculateAuthorityScore(
        "https://some-cdn.com/report.pdf",
        "中信证券：咖啡行业深度分析"
      );
      
      expect(result.source).toBe("中信证券");
      expect(result.tier).toBe(1);
    });
  });

  describe("isPDFUrl", () => {
    it("returns true for PDF URLs", () => {
      expect(isPDFUrl("https://example.com/report.pdf")).toBe(true);
      expect(isPDFUrl("https://example.com/report.PDF")).toBe(true);
      expect(isPDFUrl("https://pdf.dfcfw.com/pdf/H3_AP202501221642428721_1.pdf")).toBe(true);
    });

    it("returns false for non-PDF URLs", () => {
      expect(isPDFUrl("https://example.com/page.html")).toBe(false);
      expect(isPDFUrl("https://example.com/image.png")).toBe(false);
    });
  });

  describe("validateSearchResult", () => {
    it("rejects pure catalog documents", () => {
      const result: SearchResult = {
        title: "咖啡行业报告目录",
        url: "https://example.com/report.pdf",
        snippet: "第一章 行业概述",
        source: "Unknown",
        sourceTier: 5,
        authorityScore: 50,
        isPDF: true
      };
      
      expect(validateSearchResult(result)).toBe(false);
    });

    it("rejects news articles", () => {
      const result: SearchResult = {
        title: "咖啡行业新闻快讯",
        url: "https://example.com/news.html",
        snippet: "最新消息",
        source: "Unknown",
        sourceTier: 5,
        authorityScore: 50,
        isPDF: false
      };
      
      expect(validateSearchResult(result)).toBe(false);
    });

    it("accepts high-quality PDF reports", () => {
      const result: SearchResult = {
        title: "中信证券咖啡行业深度报告",
        url: "https://pdf.dfcfw.com/report.pdf",
        snippet: "市场规模分析",
        source: "中信证券",
        sourceTier: 1,
        authorityScore: 90,
        isPDF: true
      };
      
      expect(validateSearchResult(result)).toBe(true);
    });
  });

  describe("extractSourceName", () => {
    it("extracts known source from title", () => {
      expect(extractSourceName("中信证券：咖啡行业分析", "https://example.com")).toBe("中信证券");
      expect(extractSourceName("艾瑞咨询行业报告", "https://example.com")).toBe("艾瑞咨询");
    });

    it("extracts domain name when no known source found", () => {
      const result = extractSourceName("Some report", "https://example.com/report.pdf");
      expect(result).toBe("Example");
    });
  });

  describe("extractPublicationYear", () => {
    it("extracts year from Chinese format", () => {
      expect(extractPublicationYear("2024年咖啡行业报告", "")).toBe("2024");
      expect(extractPublicationYear("", "发布于2023年")).toBe("2023");
    });

    it("extracts year from English format", () => {
      expect(extractPublicationYear("Coffee Report Jan 15, 2024", "")).toBe("2024");
    });

    it("returns undefined when no year found", () => {
      expect(extractPublicationYear("Some report", "No date")).toBeUndefined();
    });
  });
});
