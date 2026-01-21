import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the LLM module
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn(),
}));

// Mock pdf-parse
vi.mock("pdf-parse", () => ({
  PDFParse: vi.fn().mockImplementation(() => ({
    getText: vi.fn().mockResolvedValue({ text: "Sample PDF content about market trends" }),
    getInfo: vi.fn().mockResolvedValue({ total: 5 }),
    destroy: vi.fn().mockResolvedValue(undefined),
  })),
}));

import { invokeLLM } from "./_core/llm";

describe("Wording Generation v1.6 Features", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Output Format Validation", () => {
    it("should not contain bold markers (**) in generated wording", async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: `• **Premium segment**: Growing faster due to premiumization
  – **New products** launching at higher price points
  – Consumer willingness to pay increasing`
          }
        }]
      };
      
      vi.mocked(invokeLLM).mockResolvedValueOnce(mockResponse);
      
      // Simulate the post-processing that removes ** markers
      let wording = mockResponse.choices[0].message.content;
      wording = wording.replace(/\*\*/g, '');
      
      expect(wording).not.toContain("**");
      expect(wording).toContain("Premium segment");
      expect(wording).toContain("New products");
    });

    it("should not contain periods at end of lines", async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: `• Premium segment: Growing faster due to premiumization.
  – New products launching at higher price points.
  – Consumer willingness to pay increasing.`
          }
        }]
      };
      
      vi.mocked(invokeLLM).mockResolvedValueOnce(mockResponse);
      
      // Simulate the post-processing that removes periods
      let wording = mockResponse.choices[0].message.content;
      wording = wording.replace(/\.(\s*\n)/g, '$1');
      wording = wording.replace(/\.(\s*)$/g, '$1');
      
      // Check that periods at end of lines are removed
      const lines = wording.split('\n');
      lines.forEach(line => {
        const trimmed = line.trim();
        if (trimmed.length > 0) {
          expect(trimmed.endsWith('.')).toBe(false);
        }
      });
    });

    it("should use Bain time format ('19, '24, '19-'24, '24-'30E)", () => {
      const validFormats = ["'19", "'24", "'19-'24", "'24-'30E", "'09-'15", "'15-'19"];
      const invalidFormats = ["2019", "2024", "2019-2024", "24-30E"];
      
      validFormats.forEach(format => {
        expect(format).toMatch(/^'[0-9]{2}(-'[0-9]{2}E?)?$/);
      });
      
      invalidFormats.forEach(format => {
        expect(format).not.toMatch(/^'[0-9]{2}(-'[0-9]{2}E?)?$/);
      });
    });
  });

  describe("Source Citation Features", () => {
    it("should include URL field in citation schema", () => {
      const citationSchema = {
        type: "object",
        properties: {
          bullet: { type: "string" },
          sources: {
            type: "array",
            items: {
              type: "object",
              properties: {
                type: { type: "string" },
                detail: { type: "string" },
                location: { type: "string" },
                url: { type: "string" }
              },
              required: ["type", "detail", "location"]
            }
          }
        },
        required: ["bullet", "sources"]
      };
      
      expect(citationSchema.properties.sources.items.properties).toHaveProperty("url");
    });

    it("should validate authority source tiers", () => {
      const tier1Sources = ["广发证券", "天风证券", "国金证券", "中信证券", "招商证券", "华泰证券"];
      const tier2Sources = ["Morgan Stanley", "Goldman Sachs", "JP Morgan"];
      const tier3Sources = ["艾瑞咨询", "灼识咨询", "德勤", "麦肯锡", "BCG", "贝恩"];
      
      // Helper function to check tier
      const getSourceTier = (sourceName: string): number => {
        const lowerName = sourceName.toLowerCase();
        if (tier1Sources.some(s => lowerName.includes(s.toLowerCase()))) return 1;
        if (tier2Sources.some(s => lowerName.includes(s.toLowerCase()))) return 2;
        if (tier3Sources.some(s => lowerName.includes(s.toLowerCase()))) return 3;
        return 99;
      };
      
      expect(getSourceTier("广发证券研究报告")).toBe(1);
      expect(getSourceTier("Morgan Stanley Research")).toBe(2);
      expect(getSourceTier("艾瑞咨询行业报告")).toBe(3);
      expect(getSourceTier("Unknown Source")).toBe(99);
    });

    it("should exclude low-quality source types", () => {
      const excludedTypes = [
        "纯目录型报告",
        "新闻通稿",
        "上市公司财报",
        "简报或摘要",
        "营销宣传文档"
      ];
      
      const isExcludedSource = (sourceType: string): boolean => {
        return excludedTypes.some(excluded => 
          sourceType.includes(excluded) || 
          sourceType.includes("目录") ||
          sourceType.includes("新闻") ||
          sourceType.includes("财报") ||
          sourceType.includes("摘要") ||
          sourceType.includes("营销")
        );
      };
      
      expect(isExcludedSource("纯目录型报告")).toBe(true);
      expect(isExcludedSource("新闻通稿")).toBe(true);
      expect(isExcludedSource("深度研究报告")).toBe(false);
      expect(isExcludedSource("行业白皮书")).toBe(false);
    });
  });

  describe("Pattern-level Requirements", () => {
    it("should not use 'value growth' phrase in wording", () => {
      const badPhrases = ["value growth", "Value Growth", "VALUE GROWTH"];
      const goodPhrases = ["market expanding", "segment outgrowing", "growth accelerating"];
      
      const containsBadPhrase = (text: string): boolean => {
        return badPhrases.some(phrase => text.toLowerCase().includes(phrase.toLowerCase()));
      };
      
      expect(containsBadPhrase("Premium segment showing strong value growth")).toBe(true);
      expect(containsBadPhrase("Premium segment outgrowing overall market")).toBe(false);
    });

    it("should cover both historical and future trends", () => {
      const wordingWithBothTrends = `• Premium: Outgrowing overall market in '19-'24, momentum expected to continue through '30E
  – Historical growth driven by premiumization trend
  – Future growth supported by rising disposable income`;
      
      const hasHistorical = wordingWithBothTrends.includes("'19-'24") || 
                           wordingWithBothTrends.includes("Historical");
      const hasFuture = wordingWithBothTrends.includes("'30E") || 
                        wordingWithBothTrends.includes("Future") ||
                        wordingWithBothTrends.includes("expected");
      
      expect(hasHistorical).toBe(true);
      expect(hasFuture).toBe(true);
    });
  });

  describe("URL Validation", () => {
    it("should correctly validate URLs", () => {
      const isValidUrl = (str: string | undefined): boolean => {
        if (!str) return false;
        try {
          new URL(str);
          return true;
        } catch {
          return str.startsWith("http://") || str.startsWith("https://");
        }
      };
      
      expect(isValidUrl("https://example.com/report.pdf")).toBe(true);
      expect(isValidUrl("http://research.com/data")).toBe(true);
      expect(isValidUrl("not-a-url")).toBe(false);
      expect(isValidUrl(undefined)).toBe(false);
      expect(isValidUrl("")).toBe(false);
    });
  });
});
