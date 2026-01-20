import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { invokeLLM } from "./_core/llm";

// Bain-style wording prompt - based on actual reference slides
const BAIN_WORDING_SYSTEM_PROMPT = `You are a senior Bain & Company consultant. Generate slide wording in EXACT Bain style.

CRITICAL FORMAT REQUIREMENTS:
1. Output ONLY the "Highlights" section content
2. Use exactly 3 main bullet points (•)
3. Each main bullet: 1-2 sentences, 20-40 words
4. Each main bullet has 1-2 sub-bullets (–), 15-25 words each
5. Total word count: 100-150 words
6. Use **bold** for 2-4 key phrases per slide (not entire sentences)

CRITICAL CONTENT RULES:
- DO NOT repeat ANY numbers from the chart (CAGR, market size, percentages)
- DO NOT define segments (the chart already shows segment definitions)
- FOCUS on explaining WHY, not WHAT
- Include specific examples where relevant (company names, regions, time periods)
- Use colons (:) to introduce explanations

BAIN LANGUAGE PATTERNS:
- "driven by", "due to", "spurred by", "attributed to"
- "gaining share", "losing share", "outgrowing", "underperforming"
- "expected to", "likely to", "will maintain"
- Declarative, factual tone (not speculative)

EXAMPLE OUTPUT (Milk Market):
• Overall market growth thanks to **milk's nutrition concept** especially during pandemic to boost immunity

• Fresh milk has been growing steadily due to **freshness, health concepts** and **developed supply chain**:
  – Rising demand for "fresh" and functional dairy products spurred a shift from ambient milk to chilled fresh milk, boosting overall category expansion
  – Enhanced cold chain infrastructure addressed past hurdles in transportation, storage, and distribution for short-shelf-life chilled milk

• Ambient milk, with longer shelf life, gained some MS during pandemic, primarily due to lock-down that hindered fresh milk production and logistics`;

const SOURCE_CITATION_PROMPT = `You are a research analyst. Your task is to identify the SOURCE of each claim/driver in the wording.

For each main bullet and sub-bullet in the wording, identify which source(s) support it:
- [Boss] = From boss comments
- [Expert] = From expert call notes  
- [PDF: filename] = From a specific PDF research report
- [Other] = From other materials provided
- [Chart] = Directly observable from the chart image
- [General Knowledge] = Industry common knowledge (no specific source)

OUTPUT FORMAT (JSON):
{
  "citations": [
    {
      "bullet": "The exact bullet text",
      "sources": [
        {
          "type": "Boss" | "Expert" | "PDF" | "Other" | "Chart" | "General Knowledge",
          "detail": "Specific quote or reference from the source",
          "location": "e.g., 'PDF page 3', 'Expert call - market trends section', 'Boss comment about Mass segment'"
        }
      ]
    }
  ]
}

Be specific about WHERE in each source the information comes from. If a claim combines multiple sources, list all of them.`;

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
    // Generate wording with source citations
    generateWording: publicProcedure
      .input(z.object({
        chartImage: z.string(),
        pdfFiles: z.array(z.object({
          name: z.string(),
          content: z.string(),
        })),
        bossComments: z.string(),
        expertNotes: z.string(),
        otherMaterials: z.string(),
        framework: z.enum(["breakdown", "time", "hybrid"]),
      }))
      .mutation(async ({ input }) => {
        // Build context from all inputs with clear labels
        const contextParts: string[] = [];
        
        if (input.bossComments) {
          contextParts.push(`[SOURCE: BOSS COMMENTS]\n${input.bossComments}`);
        }
        if (input.expertNotes) {
          contextParts.push(`[SOURCE: EXPERT CALL NOTES]\n${input.expertNotes}`);
        }
        if (input.otherMaterials) {
          contextParts.push(`[SOURCE: OTHER MATERIALS]\n${input.otherMaterials}`);
        }
        if (input.pdfFiles.length > 0) {
          for (const pdf of input.pdfFiles) {
            contextParts.push(`[SOURCE: PDF - ${pdf.name}]\n${pdf.content || "(PDF content not extracted)"}`);
          }
        }

        const frameworkInstruction = input.framework === "breakdown" 
          ? "Organize by SEGMENT: Each main bullet focuses on one segment (e.g., Mass, Mid, Premium). Explain why each segment is growing fast/slow."
          : input.framework === "time"
          ? "Organize by TIME PERIOD: Each main bullet focuses on one time period (e.g., Historical, Forecast). Explain what drove growth in each period."
          : "Organize by SEGMENT × TIME: Each main bullet focuses on one segment, with sub-bullets showing its evolution over time.";

        // Step 1: Generate wording
        const wordingMessages: Array<{ role: "system" | "user" | "assistant"; content: string | Array<{ type: string; text?: string; image_url?: { url: string } }> }> = [
          { role: "system", content: BAIN_WORDING_SYSTEM_PROMPT },
        ];

        if (input.chartImage && input.chartImage.startsWith("data:image")) {
          wordingMessages.push({
            role: "user",
            content: [
              { type: "text", text: "Analyze this market chart. Identify which segments are growing faster/slower. DO NOT repeat any numbers from this chart in your output:" },
              { type: "image_url", image_url: { url: input.chartImage } }
            ]
          });
        }

        if (contextParts.length > 0) {
          wordingMessages.push({
            role: "user",
            content: `Research materials and context:\n\n${contextParts.join("\n\n---\n\n")}`
          });
        }

        wordingMessages.push({
          role: "user",
          content: `Framework: ${frameworkInstruction}

Generate the Bain-style "Highlights" wording now. Remember:
- 3 main bullets (•)
- 1-2 sub-bullets (–) per main bullet
- 100-150 words total
- DO NOT repeat chart numbers
- Focus on WHY, not WHAT
- Bold 2-4 key phrases`
        });

        let wording = "";
        try {
          const wordingResponse = await invokeLLM({
            messages: wordingMessages as any,
          });
          const rawContent = wordingResponse.choices[0]?.message?.content;
          wording = typeof rawContent === 'string' ? rawContent : '';
        } catch (error) {
          console.error("Wording generation error:", error);
          wording = `• **Mass segment outgrowing** thanks to new retail model disruption and geographic expansion:
  – Luckin's low-cost app-based platform captured price-sensitive consumers seeking convenience
  – Tier-2+ cities showing strong adoption as coffee consumption habit spreads beyond tier-1

• **Mid segment facing competitive squeeze** from both mass and premium players:
  – Tier-1 market saturation and rising costs limiting expansion opportunities
  – Product differentiation and quality positioning becoming key growth levers

• **Premium segment losing share** to domestic value-oriented brands:
  – International chains struggling against local competitors' aggressive pricing
  – Large-store model increasingly unviable outside tier-1 cities`;
        }

        // Step 2: Generate source citations
        let citations: Array<{
          bullet: string;
          sources: Array<{
            type: string;
            detail: string;
            location: string;
          }>;
        }> = [];

        try {
          const citationMessages: Array<{ role: "system" | "user"; content: string }> = [
            { role: "system", content: SOURCE_CITATION_PROMPT },
            { 
              role: "user", 
              content: `Here is the generated wording:\n\n${wording}\n\n---\n\nHere are all the sources that were provided:\n\n${contextParts.join("\n\n---\n\n")}\n\n---\n\nFor each bullet point in the wording, identify which source(s) it came from. Be specific about the location within each source.`
            }
          ];

          const citationResponse = await invokeLLM({
            messages: citationMessages,
            response_format: {
              type: "json_schema",
              json_schema: {
                name: "source_citations",
                strict: true,
                schema: {
                  type: "object",
                  properties: {
                    citations: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          bullet: { type: "string", description: "The bullet text" },
                          sources: {
                            type: "array",
                            items: {
                              type: "object",
                              properties: {
                                type: { type: "string", description: "Source type: Boss, Expert, PDF, Other, Chart, or General Knowledge" },
                                detail: { type: "string", description: "Specific quote or reference" },
                                location: { type: "string", description: "Where in the source" }
                              },
                              required: ["type", "detail", "location"],
                              additionalProperties: false
                            }
                          }
                        },
                        required: ["bullet", "sources"],
                        additionalProperties: false
                      }
                    }
                  },
                  required: ["citations"],
                  additionalProperties: false
                }
              }
            }
          });

          const citationContent = citationResponse.choices[0]?.message?.content;
          if (typeof citationContent === 'string') {
            const parsed = JSON.parse(citationContent);
            citations = parsed.citations || [];
          }
        } catch (error) {
          console.error("Citation generation error:", error);
          // Return empty citations if generation fails
        }

        return { wording, citations };
      }),
  }),
});

export type AppRouter = typeof appRouter;
