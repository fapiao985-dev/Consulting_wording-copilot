import { describe, it, expect } from "vitest";
import {
  validateReportQuality,
  getSourceTier,
  QUALITY_CRITERIA
} from "./db";

describe("Industry Reports Quality Validation", () => {
  describe("getSourceTier", () => {
    it("returns tier 1 for domestic securities firms", () => {
      expect(getSourceTier("中信证券")).toBe("1");
      expect(getSourceTier("广发证券研究所")).toBe("1");
      expect(getSourceTier("天风证券")).toBe("1");
      expect(getSourceTier("招商证券")).toBe("1");
    });

    it("returns tier 2 for foreign investment banks", () => {
      expect(getSourceTier("Morgan Stanley")).toBe("2");
      expect(getSourceTier("Goldman Sachs Research")).toBe("2");
      expect(getSourceTier("JP Morgan")).toBe("2");
    });

    it("returns tier 3 for consulting firms", () => {
      expect(getSourceTier("艾瑞咨询")).toBe("3");
      expect(getSourceTier("灼识咨询")).toBe("3");
      expect(getSourceTier("麦肯锡")).toBe("3");
      expect(getSourceTier("BCG")).toBe("3");
      expect(getSourceTier("贝恩咨询")).toBe("3");
    });

    it("returns tier 4 for industry research institutions", () => {
      expect(getSourceTier("华经情报网")).toBe("4");
      expect(getSourceTier("智研咨询")).toBe("4");
      expect(getSourceTier("观研报告网")).toBe("4");
    });

    it("returns tier 5 for unknown sources", () => {
      expect(getSourceTier("Unknown Source")).toBe("5");
      expect(getSourceTier("Random Blog")).toBe("5");
    });
  });

  describe("validateReportQuality", () => {
    it("rejects reports with excluded keywords in title", () => {
      const result = validateReportQuality({
        title: "咖啡行业报告目录",
        sourceName: "中信证券",
      });
      expect(result.valid).toBe(false);
      expect(result.reason).toContain("目录");
    });

    it("rejects news articles", () => {
      const result = validateReportQuality({
        title: "咖啡行业新闻快讯",
        sourceName: "某新闻网",
      });
      expect(result.valid).toBe(false);
      expect(result.reason).toContain("新闻");
    });

    it("rejects reports outside year range", () => {
      const result = validateReportQuality({
        title: "咖啡行业深度报告",
        sourceName: "中信证券",
        publicationYear: "2018",
      });
      expect(result.valid).toBe(false);
      expect(result.reason).toContain("2018");
    });

    it("rejects reports with small file size", () => {
      const result = validateReportQuality({
        title: "咖啡行业深度报告",
        sourceName: "中信证券",
        fileSizeKb: 100,
      });
      expect(result.valid).toBe(false);
      expect(result.reason).toContain("100KB");
    });

    it("rejects reports with few pages", () => {
      const result = validateReportQuality({
        title: "咖啡行业深度报告",
        sourceName: "中信证券",
        pageCount: 10,
      });
      expect(result.valid).toBe(false);
      expect(result.reason).toContain("10");
    });

    it("accepts valid reports", () => {
      const result = validateReportQuality({
        title: "中国现制咖啡行业深度研究报告",
        sourceName: "中信证券",
        publicationYear: "2024",
        fileSizeKb: 500,
        pageCount: 30,
      });
      expect(result.valid).toBe(true);
    });

    it("accepts reports without optional fields", () => {
      const result = validateReportQuality({
        title: "咖啡行业深度分析",
        sourceName: "艾瑞咨询",
      });
      expect(result.valid).toBe(true);
    });
  });

  describe("QUALITY_CRITERIA constants", () => {
    it("has correct minimum values", () => {
      expect(QUALITY_CRITERIA.MIN_FILE_SIZE_KB).toBe(200);
      expect(QUALITY_CRITERIA.MIN_PAGE_COUNT).toBe(15);
      expect(QUALITY_CRITERIA.MIN_YEAR).toBe(2020);
      expect(QUALITY_CRITERIA.MAX_YEAR).toBe(2025);
    });

    it("has all tier 1 sources defined", () => {
      expect(QUALITY_CRITERIA.TIER_1_SOURCES).toContain("中信证券");
      expect(QUALITY_CRITERIA.TIER_1_SOURCES).toContain("广发证券");
      expect(QUALITY_CRITERIA.TIER_1_SOURCES.length).toBeGreaterThanOrEqual(8);
    });

    it("has excluded keywords defined", () => {
      expect(QUALITY_CRITERIA.EXCLUDED_KEYWORDS).toContain("目录");
      expect(QUALITY_CRITERIA.EXCLUDED_KEYWORDS).toContain("新闻");
      expect(QUALITY_CRITERIA.EXCLUDED_KEYWORDS).toContain("财报");
    });
  });
});
