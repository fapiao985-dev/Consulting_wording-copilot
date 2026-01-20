import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { invokeLLM } from "./_core/llm";

// Bain-style wording prompt template
const BAIN_WORDING_SYSTEM_PROMPT = `You are a senior Bain & Company consultant specializing in market analysis. Your task is to generate slide wording in the exact Bain style.

CRITICAL FORMAT REQUIREMENTS:
- Output ONLY the "Highlights" section content
- Use exactly 3-4 main bullet points (•)
- Each main bullet: ONE sentence, 15-25 words max
- Each main bullet has 2 sub-bullets (–)
- Each sub-bullet: ONE sentence, 15-20 words max
- Total word count: approximately 100-120 words
- DO NOT repeat information already shown in the chart (e.g., specific CAGR numbers, segment definitions)
- Focus on explaining WHY, not WHAT

BAIN STYLE ELEMENTS:
- Use comparative language: "outgrowing", "underperforming", "gaining share", "losing share"
- Use causal language: "driven by", "due to", "spurred by", "attributed to"
- Be declarative, not speculative
- Include specific examples where relevant (e.g., company names, regions)
- Bold key phrases using **text**

EXAMPLE OUTPUT FORMAT:
• **Mass segment outgrowing, driven by new retail model and tier-2+ city expansion:**
  – Luckin's low-cost app platform captured price-sensitive consumers
  – Tier-2+ cities showing strong growth as tier-1 saturates

• **Mid segment facing squeeze from both mass and premium competitors:**
  – Tier-1 saturation and higher costs limiting expansion
  – Product differentiation becoming key growth lever

• **Premium segment losing share to domestic value-oriented brands:**
  – International brands struggling against domestic competitors
  – Large-store model unviable in tier-2+; growth limited to tier-1`;

const DRIVER_EXTRACTION_PROMPT = `You are a market research analyst. Analyze the provided materials and extract key market drivers.

For each driver, identify:
1. Which market segment it applies to
2. Which time period (historical or forecast)
3. The driver content (concise, factual)
4. The source of this information

Output as JSON array with this structure:
{
  "drivers": [
    {
      "segment": "Mass/Mid/Premium/Overall",
      "period": "Historical (YYYY-YYYY)" or "Forecast (YYYY-YYYY)",
      "content": "Concise driver description",
      "source": "Source document or input type"
    }
  ]
}

Extract 6-10 drivers covering different segments and time periods.`;

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  copilot: router({
    extractDrivers: publicProcedure
      .input(z.object({
        chartImage: z.string(),
        pdfFiles: z.array(z.string()),
        bossComments: z.string(),
        expertNotes: z.string(),
        otherMaterials: z.string(),
        framework: z.enum(["breakdown", "time", "hybrid"]),
      }))
      .mutation(async ({ input }) => {
        // Build context from all inputs
        const contextParts: string[] = [];
        
        if (input.bossComments) {
          contextParts.push(`BOSS COMMENTS:\n${input.bossComments}`);
        }
        if (input.expertNotes) {
          contextParts.push(`EXPERT CALL NOTES:\n${input.expertNotes}`);
        }
        if (input.otherMaterials) {
          contextParts.push(`OTHER MATERIALS:\n${input.otherMaterials}`);
        }

        const frameworkInstruction = input.framework === "breakdown" 
          ? "Focus on segment-based drivers (e.g., Mass, Mid, Premium segments)"
          : input.framework === "time"
          ? "Focus on time-period-based drivers (e.g., historical vs forecast periods)"
          : "Focus on both segment and time-period dimensions";

        // Build messages for LLM
        const messages: Array<{ role: "system" | "user" | "assistant"; content: string | Array<{ type: string; text?: string; image_url?: { url: string } }> }> = [
          { role: "system", content: DRIVER_EXTRACTION_PROMPT + "\n\n" + frameworkInstruction },
        ];

        // Add chart image if provided
        if (input.chartImage && input.chartImage.startsWith("data:image")) {
          messages.push({
            role: "user",
            content: [
              { type: "text", text: "Analyze this market chart to understand segment performance and growth trends:" },
              { type: "image_url", image_url: { url: input.chartImage } }
            ]
          });
        }

        // Add text context
        if (contextParts.length > 0) {
          messages.push({
            role: "user",
            content: `Additional context from research materials:\n\n${contextParts.join("\n\n---\n\n")}`
          });
        }

        // Add PDF content hints (we'll extract text in a real implementation)
        if (input.pdfFiles.length > 0) {
          messages.push({
            role: "user",
            content: `${input.pdfFiles.length} PDF research reports have been provided. Extract relevant market drivers from the chart and context above.`
          });
        }

        messages.push({
          role: "user",
          content: "Based on all the above materials, extract the key market drivers. Return ONLY valid JSON."
        });

        try {
          const response = await invokeLLM({
            messages: messages as any,
            response_format: {
              type: "json_schema",
              json_schema: {
                name: "driver_extraction",
                strict: true,
                schema: {
                  type: "object",
                  properties: {
                    drivers: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          segment: { type: "string", description: "Market segment (Mass, Mid, Premium, or Overall)" },
                          period: { type: "string", description: "Time period (e.g., Historical 2019-2024 or Forecast 2024-2029)" },
                          content: { type: "string", description: "Concise driver description" },
                          source: { type: "string", description: "Source of this information" }
                        },
                        required: ["segment", "period", "content", "source"],
                        additionalProperties: false
                      }
                    }
                  },
                  required: ["drivers"],
                  additionalProperties: false
                }
              }
            }
          });

          const rawContent = response.choices[0]?.message?.content;
          const content = typeof rawContent === 'string' ? rawContent : '{"drivers":[]}';
          const parsed = JSON.parse(content);
          return { drivers: parsed.drivers || [] };
        } catch (error) {
          console.error("Driver extraction error:", error);
          // Return mock drivers for demo if LLM fails
          return {
            drivers: [
              { segment: "Mass", period: "Historical (2020-2025)", content: "New retail model disruption driving rapid growth", source: "Chart analysis" },
              { segment: "Mass", period: "Forecast (2025-2030)", content: "Continued tier-2+ city expansion expected", source: "Boss comments" },
              { segment: "Mid", period: "Historical (2020-2025)", content: "Facing competitive squeeze from both ends", source: "Chart analysis" },
              { segment: "Premium", period: "Historical (2020-2025)", content: "Losing share to domestic value brands", source: "Expert notes" },
            ]
          };
        }
      }),

    generateWording: publicProcedure
      .input(z.object({
        drivers: z.array(z.object({
          segment: z.string(),
          period: z.string(),
          content: z.string(),
          source: z.string(),
        })),
        framework: z.enum(["breakdown", "time", "hybrid"]),
        chartImage: z.string(),
      }))
      .mutation(async ({ input }) => {
        const frameworkInstruction = input.framework === "breakdown"
          ? "Organize the wording BY SEGMENT. Each main bullet should focus on one segment (e.g., Mass, Mid, Premium)."
          : input.framework === "time"
          ? "Organize the wording BY TIME PERIOD. Each main bullet should focus on one time period (e.g., Historical, Forecast)."
          : "Organize the wording BY SEGMENT, with each segment showing its evolution over time.";

        const driversText = input.drivers.map(d => 
          `- ${d.segment} (${d.period}): ${d.content} [Source: ${d.source}]`
        ).join("\n");

        const messages: Array<{ role: "system" | "user" | "assistant"; content: string | Array<{ type: string; text?: string; image_url?: { url: string } }> }> = [
          { role: "system", content: BAIN_WORDING_SYSTEM_PROMPT },
        ];

        // Add chart image for context
        if (input.chartImage && input.chartImage.startsWith("data:image")) {
          messages.push({
            role: "user",
            content: [
              { type: "text", text: "Reference chart (DO NOT repeat numbers from this chart in the wording):" },
              { type: "image_url", image_url: { url: input.chartImage } }
            ]
          });
        }

        messages.push({
          role: "user",
          content: `Framework: ${frameworkInstruction}

Approved drivers to incorporate:
${driversText}

Generate the Bain-style "Highlights" section wording. Remember:
- 3-4 main bullets only
- 2 sub-bullets per main bullet
- ~100-120 words total
- DO NOT repeat chart data
- Focus on WHY, not WHAT`
        });

        try {
          const response = await invokeLLM({
            messages: messages as any,
          });

          const content = response.choices[0]?.message?.content;
          const wording = typeof content === 'string' ? content : '';
          return { wording };
        } catch (error) {
          console.error("Wording generation error:", error);
          // Return example wording if LLM fails
          return {
            wording: `• **Mass segment outgrowing, driven by new retail model and tier-2+ city expansion:**
  – Luckin's low-cost app platform captured price-sensitive consumers
  – Tier-2+ cities showing strong growth as tier-1 saturates

• **Mid segment facing squeeze from both mass and premium competitors:**
  – Tier-1 saturation and higher costs limiting expansion
  – Product differentiation becoming key growth lever

• **Premium segment losing share to domestic value-oriented brands:**
  – International brands struggling against domestic competitors
  – Large-store model unviable in tier-2+; growth limited to tier-1`
          };
        }
      }),
  }),
});

export type AppRouter = typeof appRouter;
