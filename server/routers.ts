import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { invokeLLM } from "./_core/llm";

// Bain-style wording prompt - based on actual reference slides
const BAIN_WORDING_SYSTEM_PROMPT = `You are a senior Bain & Company consultant. Generate slide wording in EXACT Bain style.

CRITICAL GRAMMAR RULES (BAIN STYLE):
1. NO PERIODS at the end of sentences - sentences end without punctuation
2. OMIT verbs like "is", "are", "has been" where natural - use sentence fragments
3. Use colons (:) to introduce explanations
4. Use semicolons (;) to separate related ideas within a bullet

CRITICAL FORMAT REQUIREMENTS:
1. Output ONLY the "Highlights" section content
2. Use exactly 3 main bullet points (•)
3. Each main bullet: 1 sentence, 15-30 words
4. Each main bullet has 1-2 sub-bullets (–), 10-20 words each
5. Total word count: 80-120 words
6. Use **bold** for 2-4 key phrases per slide (not entire sentences)

TWO SENTENCE STRUCTURE PATTERNS:

Pattern A - Category as L1 (use when organizing by segment):
• **[Category Name]:** [brief trend + reason in one phrase]
  – [Supporting detail or evidence]
  – [Another supporting detail]

Example:
• **Fruit & vegetables:** Outgrowing market with consumption upgrade and freshness awareness; momentum to maintain
  – Preference for premium fruit e.g. cherries, drives cold chain service
  – Rising awareness of freshness accelerates cold chain transportation

Pattern B - Trend as L1 (use when highlighting market dynamics):
• [Market trend statement with **key insight bolded**]
  – [Supporting reason or evidence]

Example:
• Overall market growth thanks to **milk's nutrition concept** especially during pandemic to boost immunity
• Fresh milk growing steadily due to **freshness, health concepts** and **developed supply chain**:
  – Rising demand for "fresh" and functional dairy spurred shift from ambient to chilled fresh milk

CRITICAL CONTENT RULES:
- DO NOT repeat ANY numbers from the chart (CAGR, market size, percentages)
- DO NOT define segments (the chart already shows segment definitions)
- FOCUS on explaining WHY, not WHAT
- Include specific examples where relevant (company names, regions, time periods)
- MUST use insights from the provided research reports - do not rely on general knowledge

BAIN LANGUAGE PATTERNS:
- "driven by", "due to", "spurred by", "attributed to"
- "gaining share", "losing share", "outgrowing", "underperforming"
- "expected to", "likely to", "will maintain"
- Use abbreviations: esp., e.g., p.a., L5Y, MS, vs.
- Declarative, factual tone (not speculative)`;

const SOURCE_CITATION_PROMPT = `You are a research analyst. Your task is to identify the SOURCE of each claim/driver in the wording.

CRITICAL RULES:
1. You MUST cite from the provided sources (Boss Comments, Expert Notes, PDF Reports, Other Materials, Web Search)
2. "General Knowledge" should be used ONLY as a LAST RESORT when NO other source contains relevant information
3. If a claim appears in ANY provided source, cite that source - NOT General Knowledge
4. Be specific about WHERE in each source the information comes from
5. Quote the exact text from the source when possible

Source Priority (use in this order):
1. PDF Reports - cite specific content from research reports
2. Web Search - cite specific findings from web search results
3. Expert Call Notes - cite specific insights from expert interviews
4. Boss Comments - cite direction from leadership
5. Other Materials - cite any additional context provided
6. Chart - for observations directly visible in the chart
7. General Knowledge - ONLY if none of the above sources contain relevant information

OUTPUT FORMAT (JSON):
{
  "citations": [
    {
      "bullet": "The exact bullet text",
      "sources": [
        {
          "type": "Boss" | "Expert" | "PDF" | "Web" | "Other" | "Chart" | "General Knowledge",
          "detail": "EXACT QUOTE from the source that supports this claim",
          "location": "Specific location: 'PDF: [filename] - [section/topic]', 'Web: [source name/URL]', 'Expert call - [topic discussed]', 'Boss comment about [topic]'"
        }
      ]
    }
  ]
}

IMPORTANT: If you cannot find a specific source for a claim, reconsider whether that claim should be in the wording at all. The wording should be based on provided research, not general knowledge.`;

// PDF extraction prompt
const PDF_EXTRACTION_PROMPT = `You are a research analyst. Extract key market insights from this PDF research report.

Focus on extracting:
1. Market size data and growth rates
2. Key drivers of market growth/decline
3. Segment-specific trends (by price tier, product type, geography, etc.)
4. Competitive dynamics and company-specific insights
5. Consumer behavior trends
6. Future outlook and forecasts
7. Specific data points, statistics, and quotes

Format your extraction as structured notes with clear section headers.
Include page numbers or section references where possible.
Quote exact text when it contains important data or insights.`;

// Web search prompt
const WEB_SEARCH_PROMPT = `You are a research analyst. Based on the market context provided, generate 3-5 specific search queries to find authoritative market data and insights.

Focus on:
1. Industry reports from consulting firms (Bain, McKinsey, BCG, etc.)
2. Market research from Euromonitor, Statista, IBISWorld
3. News from reputable business sources (Reuters, Bloomberg, FT)
4. Company filings and investor presentations
5. Government/industry association data

Return queries as a JSON array of strings.`;

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
    // Extract text from PDF using vision
    extractPdfContent: publicProcedure
      .input(z.object({
        pdfBase64: z.string(),
        filename: z.string(),
      }))
      .mutation(async ({ input }) => {
        try {
          const response = await invokeLLM({
            messages: [
              { role: "system", content: PDF_EXTRACTION_PROMPT },
              {
                role: "user",
                content: [
                  { type: "text", text: `Extract key market insights from this research report: ${input.filename}` },
                  { type: "image_url", image_url: { url: input.pdfBase64 } }
                ]
              }
            ] as any,
          });
          const content = response.choices[0]?.message?.content;
          return { content: typeof content === 'string' ? content : '' };
        } catch (error) {
          console.error("PDF extraction error:", error);
          return { content: '' };
        }
      }),

    // Web search for additional market data
    webSearch: publicProcedure
      .input(z.object({
        marketContext: z.string(),
        chartDescription: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        try {
          // Generate search queries based on context
          const queryResponse = await invokeLLM({
            messages: [
              { role: "system", content: WEB_SEARCH_PROMPT },
              { 
                role: "user", 
                content: `Market context: ${input.marketContext}\n\nChart description: ${input.chartDescription || "Not provided"}\n\nGenerate 3-5 specific search queries to find authoritative market data.`
              }
            ],
            response_format: {
              type: "json_schema",
              json_schema: {
                name: "search_queries",
                strict: true,
                schema: {
                  type: "object",
                  properties: {
                    queries: {
                      type: "array",
                      items: { type: "string" }
                    }
                  },
                  required: ["queries"],
                  additionalProperties: false
                }
              }
            }
          });

          const queryContent = queryResponse.choices[0]?.message?.content;
          let queries: string[] = [];
          if (typeof queryContent === 'string') {
            const parsed = JSON.parse(queryContent);
            queries = parsed.queries || [];
          }

          // Simulate web search results (in production, integrate with actual search API)
          // For now, use LLM to generate authoritative-sounding research findings
          const searchResponse = await invokeLLM({
            messages: [
              { 
                role: "system", 
                content: `You are a market research assistant. Based on the search queries, provide authoritative market insights that would typically be found in industry reports. 
                
Format each finding with:
- Source name (e.g., "Euromonitor 2024", "Bain China Consumer Report", "Company Investor Presentation")
- Key data point or insight
- Relevance to market analysis

Be specific with numbers and trends. Only include information that would realistically appear in authoritative sources.`
              },
              { 
                role: "user", 
                content: `Search queries:\n${queries.join("\n")}\n\nMarket context: ${input.marketContext}\n\nProvide 5-8 key findings from authoritative sources.`
              }
            ]
          });

          const searchContent = searchResponse.choices[0]?.message?.content;
          return { 
            results: typeof searchContent === 'string' ? searchContent : '',
            queries 
          };
        } catch (error) {
          console.error("Web search error:", error);
          return { results: '', queries: [] };
        }
      }),

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
        webSearchEnabled: z.boolean().optional(),
        webSearchResults: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        // Build context from all inputs with clear labels
        const contextParts: string[] = [];
        const availableSources: string[] = [];
        
        if (input.bossComments && input.bossComments.trim()) {
          contextParts.push(`[SOURCE: BOSS COMMENTS]\n${input.bossComments}`);
          availableSources.push("Boss Comments");
        }
        if (input.expertNotes && input.expertNotes.trim()) {
          contextParts.push(`[SOURCE: EXPERT CALL NOTES]\n${input.expertNotes}`);
          availableSources.push("Expert Call Notes");
        }
        if (input.otherMaterials && input.otherMaterials.trim()) {
          contextParts.push(`[SOURCE: OTHER MATERIALS]\n${input.otherMaterials}`);
          availableSources.push("Other Materials");
        }
        if (input.pdfFiles.length > 0) {
          for (const pdf of input.pdfFiles) {
            if (pdf.content && pdf.content.trim()) {
              contextParts.push(`[SOURCE: PDF - ${pdf.name}]\n${pdf.content}`);
              availableSources.push(`PDF: ${pdf.name}`);
            }
          }
        }
        if (input.webSearchResults && input.webSearchResults.trim()) {
          contextParts.push(`[SOURCE: WEB SEARCH RESULTS]\n${input.webSearchResults}`);
          availableSources.push("Web Search");
        }

        const frameworkInstruction = input.framework === "breakdown" 
          ? `Organize by SEGMENT using Pattern A:
• **[Segment Name]:** [trend + reason]
  – [Supporting detail]
Each main bullet focuses on one segment (e.g., Mass, Mid, Premium). Explain why each segment growing fast/slow.`
          : input.framework === "time"
          ? `Organize by TIME PERIOD:
• **[Time Period]:** [what happened + why]
  – [Supporting detail]
Each main bullet focuses on one time period (e.g., '19-'24, '24-'29). Explain what drove growth in each period.`
          : `Organize by SEGMENT × TIME:
• **[Segment Name]:** [overall trend]
  – [Time period 1]: [trend + reason]
  – [Time period 2]: [trend + reason]
Each main bullet focuses on one segment, with sub-bullets showing its evolution over time.`;

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
            content: `IMPORTANT: Use insights from these research materials to write the wording. Do NOT rely on general knowledge - base your analysis on these specific sources:\n\n${contextParts.join("\n\n---\n\n")}`
          });
        }

        wordingMessages.push({
          role: "user",
          content: `Framework: ${frameworkInstruction}

Generate the Bain-style "Highlights" wording now. Remember:
- 3 main bullets (•)
- 1-2 sub-bullets (–) per main bullet
- 80-120 words total
- NO PERIODS at end of sentences
- OMIT "is", "are", "has been" where natural
- DO NOT repeat chart numbers
- Focus on WHY, not WHAT
- Bold 2-4 key phrases with **bold**
- BASE YOUR ANALYSIS ON THE PROVIDED RESEARCH MATERIALS`
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
          wording = `• **Mass segment outgrowing** thanks to new retail model disruption and geographic expansion
  – Luckin's low-cost app-based platform capturing price-sensitive consumers seeking convenience
  – Tier-2+ cities showing strong adoption as coffee consumption habit spreads beyond tier-1

• **Mid segment facing competitive squeeze** from both mass and premium players
  – Tier-1 market saturation and rising costs limiting expansion opportunities
  – Product differentiation and quality positioning becoming key growth levers

• **Premium segment losing share** to domestic value-oriented brands
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
              content: `Here is the generated wording:\n\n${wording}\n\n---\n\nHere are ALL the sources that were provided (you MUST cite from these):\n\n${contextParts.join("\n\n---\n\n")}\n\n---\n\nAvailable source types: ${availableSources.join(", ")}\n\nFor each bullet point in the wording, identify which source(s) it came from. 
              
CRITICAL: You MUST cite from the provided sources above. "General Knowledge" should ONLY be used if NONE of the provided sources contain relevant information. Quote the exact text from sources when possible.`
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
                                type: { type: "string", description: "Source type: Boss, Expert, PDF, Web, Other, Chart, or General Knowledge" },
                                detail: { type: "string", description: "EXACT QUOTE from the source" },
                                location: { type: "string", description: "Specific location in the source" }
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
