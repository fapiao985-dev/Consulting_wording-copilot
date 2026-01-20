import { describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Mock the LLM module
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
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
  it("generates wording directly from inputs", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.copilot.generateWording({
      chartImage: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      pdfFiles: [],
      bossComments: "Mass segment is growing fastest",
      expertNotes: "Premium segment losing share",
      otherMaterials: "",
      framework: "breakdown",
    });

    expect(result).toHaveProperty("wording");
    expect(typeof result.wording).toBe("string");
    expect(result.wording.length).toBeGreaterThan(0);
  });

  it("handles different framework types", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const frameworks = ["breakdown", "time", "hybrid"] as const;
    
    for (const framework of frameworks) {
      const result = await caller.copilot.generateWording({
        chartImage: "data:image/png;base64,test",
        pdfFiles: [],
        bossComments: "Test comment",
        expertNotes: "",
        otherMaterials: "",
        framework,
      });

      expect(result).toHaveProperty("wording");
      expect(typeof result.wording).toBe("string");
    }
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

    // The wording should contain bullet points
    expect(result.wording).toContain("•");
  });

  it("returns wording with sub-bullets", async () => {
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

    // The wording should contain sub-bullets (en-dash)
    expect(result.wording).toContain("–");
  });

  it("returns wording with bold formatting", async () => {
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

    // The wording should contain bold text
    expect(result.wording).toContain("**");
  });
});
