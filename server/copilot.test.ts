import { describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Mock the LLM module
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [{
      message: {
        content: JSON.stringify({
          drivers: [
            { segment: "Mass", period: "Historical (2020-2025)", content: "New retail model disruption", source: "Chart analysis" },
            { segment: "Mid", period: "Forecast (2025-2030)", content: "Competitive squeeze expected", source: "Expert notes" },
          ]
        })
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

describe("copilot.extractDrivers", () => {
  it("extracts drivers from provided inputs", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.copilot.extractDrivers({
      chartImage: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      pdfFiles: [],
      bossComments: "Mass segment is growing fastest",
      expertNotes: "Premium segment losing share",
      otherMaterials: "",
      framework: "breakdown",
    });

    expect(result).toHaveProperty("drivers");
    expect(Array.isArray(result.drivers)).toBe(true);
    expect(result.drivers.length).toBeGreaterThan(0);
    
    // Check driver structure
    const firstDriver = result.drivers[0];
    expect(firstDriver).toHaveProperty("segment");
    expect(firstDriver).toHaveProperty("period");
    expect(firstDriver).toHaveProperty("content");
    expect(firstDriver).toHaveProperty("source");
  });

  it("handles different framework types", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const frameworks = ["breakdown", "time", "hybrid"] as const;
    
    for (const framework of frameworks) {
      const result = await caller.copilot.extractDrivers({
        chartImage: "data:image/png;base64,test",
        pdfFiles: [],
        bossComments: "Test comment",
        expertNotes: "",
        otherMaterials: "",
        framework,
      });

      expect(result).toHaveProperty("drivers");
    }
  });
});

describe("copilot.generateWording", () => {
  it("generates wording from approved drivers", async () => {
    // Re-mock for wording generation
    const llmModule = await import("./_core/llm");
    vi.mocked(llmModule.invokeLLM).mockResolvedValueOnce({
      choices: [{
        message: {
          content: `• **Mass segment outgrowing, driven by new retail model:**
  – Low-cost platforms capturing price-sensitive consumers
  – Tier-2+ cities showing strong growth

• **Mid segment facing competitive squeeze:**
  – Tier-1 saturation limiting expansion
  – Product differentiation becoming key lever`
        }
      }]
    } as any);

    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.copilot.generateWording({
      drivers: [
        { segment: "Mass", period: "Historical", content: "New retail model disruption", source: "Chart" },
        { segment: "Mid", period: "Forecast", content: "Competitive squeeze", source: "Expert" },
      ],
      framework: "breakdown",
      chartImage: "data:image/png;base64,test",
    });

    expect(result).toHaveProperty("wording");
    expect(typeof result.wording).toBe("string");
    expect(result.wording.length).toBeGreaterThan(0);
  });

  it("returns wording with bullet point format", async () => {
    // Re-mock for this specific test
    const llmModule = await import("./_core/llm");
    vi.mocked(llmModule.invokeLLM).mockResolvedValueOnce({
      choices: [{
        message: {
          content: `• **Mass segment outgrowing:**\n  – Test sub-bullet one\n  – Test sub-bullet two`
        }
      }]
    } as any);

    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.copilot.generateWording({
      drivers: [
        { segment: "Mass", period: "Historical", content: "Test driver", source: "Test" },
      ],
      framework: "breakdown",
      chartImage: "",
    });

    // The wording should contain bullet points
    expect(result.wording).toContain("•");
  });
});
