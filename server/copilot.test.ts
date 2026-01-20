import { describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Mock the LLM module
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn().mockImplementation(({ response_format }) => {
    // If it's a citation request (has response_format), return citations
    if (response_format) {
      return Promise.resolve({
        choices: [{
          message: {
            content: JSON.stringify({
              citations: [
                {
                  bullet: "Mass segment outgrowing thanks to new retail model disruption",
                  sources: [
                    { type: "Boss", detail: "Mass is growing fastest", location: "Boss comments" },
                    { type: "Chart", detail: "63% CAGR visible", location: "Chart analysis" }
                  ]
                },
                {
                  bullet: "Mid segment facing competitive squeeze",
                  sources: [
                    { type: "Expert", detail: "Mid-tier brands struggling", location: "Expert call notes" }
                  ]
                },
                {
                  bullet: "Premium segment losing share",
                  sources: [
                    { type: "General Knowledge", detail: "Industry trend", location: "Common knowledge" }
                  ]
                }
              ]
            })
          }
        }]
      });
    }
    // Otherwise return wording
    return Promise.resolve({
      choices: [{
        message: {
          content: `• **Mass segment outgrowing** thanks to new retail model disruption and geographic expansion:
  – Luckin's low-cost app-based platform captured price-sensitive consumers seeking convenience
  – Tier-2+ cities showing strong adoption as coffee consumption habit spreads beyond tier-1

• **Mid segment facing competitive squeeze** from both mass and premium players:
  – Tier-1 market saturation and rising costs limiting expansion opportunities
  – Product differentiation and quality positioning becoming key growth levers

• **Premium segment losing share** to domestic value-oriented brands:
  – International chains struggling against local competitors' aggressive pricing
  – Large-store model increasingly unviable outside tier-1 cities`
        }
      }]
    });
  })
}));

function createPublicContext(): TrpcContext {
  return {
    user: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

describe("copilot.generateWording", () => {
  it("generates wording with citations from inputs", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.copilot.generateWording({
      chartImage: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      pdfFiles: [{ name: "research.pdf", content: "" }],
      bossComments: "Mass segment is growing fastest",
      expertNotes: "Premium segment losing share",
      otherMaterials: "",
      framework: "breakdown",
    });

    expect(result).toHaveProperty("wording");
    expect(result).toHaveProperty("citations");
    expect(typeof result.wording).toBe("string");
    expect(Array.isArray(result.citations)).toBe(true);
  });

  it("returns citations with source details", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.copilot.generateWording({
      chartImage: "data:image/png;base64,test",
      pdfFiles: [],
      bossComments: "Test comment",
      expertNotes: "",
      otherMaterials: "",
      framework: "breakdown",
    });

    expect(result.citations.length).toBeGreaterThan(0);
    const firstCitation = result.citations[0];
    expect(firstCitation).toHaveProperty("bullet");
    expect(firstCitation).toHaveProperty("sources");
    expect(Array.isArray(firstCitation.sources)).toBe(true);
  });

  it("citation sources have required fields", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.copilot.generateWording({
      chartImage: "data:image/png;base64,test",
      pdfFiles: [],
      bossComments: "Test",
      expertNotes: "",
      otherMaterials: "",
      framework: "breakdown",
    });

    const firstSource = result.citations[0]?.sources[0];
    expect(firstSource).toHaveProperty("type");
    expect(firstSource).toHaveProperty("detail");
    expect(firstSource).toHaveProperty("location");
  });

  it("handles PDF files with name and content", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.copilot.generateWording({
      chartImage: "data:image/png;base64,test",
      pdfFiles: [
        { name: "report1.pdf", content: "Market analysis content" },
        { name: "report2.pdf", content: "Industry trends" }
      ],
      bossComments: "",
      expertNotes: "",
      otherMaterials: "",
      framework: "breakdown",
    });

    expect(result).toHaveProperty("wording");
    expect(result).toHaveProperty("citations");
  });

  it("returns wording with bullet point format", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.copilot.generateWording({
      chartImage: "data:image/png;base64,test",
      pdfFiles: [],
      bossComments: "Test",
      expertNotes: "",
      otherMaterials: "",
      framework: "breakdown",
    });

    expect(result.wording).toContain("•");
    expect(result.wording).toContain("–");
    expect(result.wording).toContain("**");
  });
});
