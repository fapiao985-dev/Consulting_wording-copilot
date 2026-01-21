import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { invokeLLM } from "./_core/llm";
import { PDFParse } from "pdf-parse";

// Authority ranking for source validation
const AUTHORITY_SOURCES = {
  tier1_domestic: ["广发证券", "天风证券", "国金证券", "中信证券", "招商证券", "华泰证券", "国海证券", "东方证券"],
  tier2_foreign: ["Morgan Stanley", "Goldman Sachs", "JP Morgan", "Bank of America", "Credit Suisse", "UBS", "Citi"],
  tier3_consulting: ["艾瑞咨询", "灼识咨询", "CIC", "久谦咨询", "艺恩咨询", "德勤", "Deloitte", "麦肯锡", "McKinsey", "BCG", "贝恩", "Bain"],
  tier4_research: ["华经情报网", "共研网", "智研咨询", "观研报告网", "中国报告网", "Euromonitor", "Statista", "IBISWorld"]
};

// Bain-style wording prompt - updated with v1.6 fixes
const BAIN_WORDING_SYSTEM_PROMPT = `You are a senior Bain & Company consultant. Generate slide wording in EXACT Bain style.

CRITICAL GRAMMAR RULES (BAIN STYLE):
1. NO PERIODS at the end of sentences - sentences end without punctuation
2. OMIT verbs like "is", "are", "has been" where natural - use sentence fragments
3. Use colons (:) to introduce explanations
4. Use semicolons (;) to separate related ideas within a bullet
5. DO NOT use asterisks (**) for bold - output plain text only

CRITICAL FORMAT REQUIREMENTS:
1. Output ONLY the "Highlights" section content
2. Use exactly 3 main bullet points (•)
3. Each main bullet: 1 sentence, 15-30 words
4. Each main bullet has 1-2 sub-bullets (–), 10-20 words each
5. Total word count: 80-120 words
6. NO BOLD MARKERS - plain text only (no ** symbols)

TIME FORMAT (BAIN STANDARD):
- Use abbreviated years: '19, '24, '30E
- Use ranges: '19-'24, '24-'30E
- Use L5Y (last 5 years), NTM (next twelve months)

TWO SENTENCE STRUCTURE PATTERNS:

Pattern A - Category as L1 (use when organizing by segment):
• [Category Name]: [brief trend + reason in one phrase]
  – [Supporting detail or evidence]
  – [Another supporting detail]

Example:
• High-grade: Outgrowing overall market driven by super-high grade new product launches; ASP uplift from premiumization
  – New UMF20+ products commanding price premium, attracting health-conscious consumers
  – Brand investment in high-grade positioning paying off with improved mix

Pattern B - Trend as L1 (use when highlighting market dynamics):
• [Market trend statement with key insight]
  – [Supporting reason or evidence]

Example:
• Overall market recovering post-inventory correction, with '24-'30E growth accelerating vs '19-'24
  – Low-grade inventory overhang largely cleared by end of '24
  – Price war subsiding as supply-demand rebalances

CRITICAL CONTENT RULES:
- DO NOT say "value growth" - the chart already shows market value, this is redundant
- DO NOT repeat ANY numbers from the chart (CAGR, market size, percentages)
- DO NOT define segments (the chart already shows segment definitions)
- FOCUS on explaining WHY, not WHAT
- MUST cover BOTH historical trends AND future outlook
- If drivers are SAME for historical and future, combine them
- If drivers are DIFFERENT, separate historical vs future clearly
- Include specific examples where relevant (company names, regions, time periods)
- MUST use insights from the provided research reports - do not rely on general knowledge

BAIN LANGUAGE PATTERNS:
- "driven by", "due to", "spurred by", "attributed to"
- "gaining share", "losing share", "outgrowing", "underperforming"
- "expected to", "likely to", "momentum to maintain"
- Use abbreviations: esp., e.g., p.a., L5Y, MS, vs.
- Declarative, factual tone (not speculative)`;

const SOURCE_CITATION_PROMPT = `You are a research analyst. Your task is to identify the SOURCE of each claim/driver in the wording.

CRITICAL RULES:
1. You MUST cite from the provided sources (Boss Comments, Expert Notes, PDF Reports, Other Materials, Web Search)
2. "General Knowledge" should be used ONLY as a LAST RESORT when NO other source contains relevant information
3. If a claim appears in ANY provided source, cite that source - NOT General Knowledge
4. Be specific about WHERE in each source the information comes from
5. Quote the exact text from the source when possible
6. For Web sources, MUST include the URL if available

SOURCE AUTHORITY RANKING (cite higher priority sources first):
Priority 1 - 国内头部券商: 广发证券, 天风证券, 国金证券, 中信证券, 招商证券, 华泰证券, 国海证券, 东方证券
Priority 2 - 国外顶级投行: Morgan Stanley, Goldman Sachs, JP Morgan, Bank of America, Credit Suisse
Priority 3 - 知名咨询机构: 艾瑞咨询, 灼识咨询, 久谦咨询, 艺恩咨询, 德勤, 麦肯锡, BCG, 贝恩
Priority 4 - 行业研究机构: 华经情报网, 共研网, 智研咨询, 观研报告网, Euromonitor, Statista

EXCLUDE these source types:
- 纯目录型报告 (table of contents only)
- 新闻通稿与媒体稿件
- 上市公司原始财报 (Earnings Release)
- 简报或摘要版本
- 营销宣传类文档

Source Priority (use in this order):
1. PDF Reports - cite specific content from research reports
2. Web Search - cite specific findings with URL
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
          "location": "Specific location: 'PDF: [filename] - [section/topic]', 'Web: [source name] - [URL]', 'Expert call - [topic discussed]', 'Boss comment about [topic]'",
          "url": "Full URL if available (for Web sources)"
        }
      ]
    }
  ]
}

IMPORTANT: 
- If you cannot find a specific source for a claim, reconsider whether that claim should be in the wording at all
- The wording should be based on provided research, not general knowledge
- For Web sources, ALWAYS include the URL in the "url" field
- Validate that the source is relevant to the industry being analyzed`;

// PDF extraction prompt for Vision API (fallback for scanned PDFs)
const PDF_VISION_EXTRACTION_PROMPT = `You are a research analyst. Extract key market insights from this PDF page image.

Focus on extracting:
1. Market size data and growth rates
2. Key drivers of market growth/decline
3. Segment-specific trends (by price tier, product type, geography, etc.)
4. Competitive dynamics and company-specific insights
5. Consumer behavior trends
6. Future outlook and forecasts
7. Specific data points, statistics, and quotes

Format your extraction as structured notes with clear section headers.
Quote exact text when it contains important data or insights.`;

// Web search prompt - updated with authority source requirements
const WEB_SEARCH_PROMPT = `You are a research analyst. Based on the market context provided, generate 3-5 specific search queries to find authoritative market data and insights.

SEARCH STRATEGY:
Use Chinese searches with PDF file type filter:
- [行业名称] 深度报告 PDF
- [行业名称] 行业白皮书 PDF
- [行业名称] 竞争格局 PDF
- [行业名称] 发展趋势 2024 2025 PDF

PRIORITY SOURCES TO TARGET:
1. 国内头部券商: 广发证券, 天风证券, 国金证券, 中信证券, 招商证券, 华泰证券
2. 国外顶级投行: Morgan Stanley, Goldman Sachs, JP Morgan
3. 知名咨询机构: 艾瑞咨询, 灼识咨询, 德勤, 麦肯锡, BCG, 贝恩
4. 行业研究机构: 华经情报网, 共研网, 智研咨询, Euromonitor, Statista

REQUIRED CONTENT DIMENSIONS:
- 市场规模与增长率数据
- 竞争格局与市场集中度分析
- 消费者/用户画像与需求分析
- 商业模式与单店/单位经济模型
- 产业链/供应链分析
- 发展趋势与未来前景预测

EXCLUDE:
- 纯目录型报告 (只有章节列表)
- 新闻通稿与媒体稿件
- 上市公司原始财报
- 简报或摘要版本
- 营销宣传类文档

Return queries as a JSON array of strings.`;

// Helper function to extract text from PDF using pdf-parse
async function extractPdfText(base64Data: string): Promise<{ text: string; numPages: number }> {
  try {
    // Remove data URL prefix if present
    const base64Content = base64Data.replace(/^data:application\/pdf;base64,/, '');
    const buffer = Buffer.from(base64Content, 'base64');
    
    // Use PDFParse class with data option
    const parser = new PDFParse({ data: buffer });
    const textResult = await parser.getText();
    const info = await parser.getInfo();
    await parser.destroy();
    
    return {
      text: textResult.text || '',
      numPages: info.total || 0
    };
  } catch (error) {
    console.error("PDF text extraction error:", error);
    return { text: '', numPages: 0 };
  }
}

// Helper function to extract content from PDF page image using Vision API
async function extractPdfPageWithVision(pageImageBase64: string, pageNum: number, filename: string): Promise<string> {
  try {
    const response = await invokeLLM({
      messages: [
        { role: "system", content: PDF_VISION_EXTRACTION_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: `Extract key market insights from page ${pageNum} of: ${filename}` },
            { type: "image_url", image_url: { url: pageImageBase64 } }
          ]
        }
      ] as any,
    });
    const content = response.choices[0]?.message?.content;
    return typeof content === 'string' ? content : '';
  } catch (error) {
    console.error(`Vision extraction error for page ${pageNum}:`, error);
    return '';
  }
}

// Helper function to validate source authority
function validateSourceAuthority(sourceName: string): { isValid: boolean; tier: number; tierName: string } {
  const lowerName = sourceName.toLowerCase();
  
  for (const source of AUTHORITY_SOURCES.tier1_domestic) {
    if (lowerName.includes(source.toLowerCase())) {
      return { isValid: true, tier: 1, tierName: "国内头部券商" };
    }
  }
  for (const source of AUTHORITY_SOURCES.tier2_foreign) {
    if (lowerName.includes(source.toLowerCase())) {
      return { isValid: true, tier: 2, tierName: "国外顶级投行" };
    }
  }
  for (const source of AUTHORITY_SOURCES.tier3_consulting) {
    if (lowerName.includes(source.toLowerCase())) {
      return { isValid: true, tier: 3, tierName: "知名咨询机构" };
    }
  }
  for (const source of AUTHORITY_SOURCES.tier4_research) {
    if (lowerName.includes(source.toLowerCase())) {
      return { isValid: true, tier: 4, tierName: "行业研究机构" };
    }
  }
  
  return { isValid: false, tier: 99, tierName: "未验证来源" };
}

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
    // Hybrid PDF extraction: text parsing first, Vision API fallback
    extractPdfContent: publicProcedure
      .input(z.object({
        pdfBase64: z.string(),
        filename: z.string(),
        pageImages: z.array(z.string()).optional(), // Optional page images for Vision API fallback
      }))
      .mutation(async ({ input }) => {
        try {
          // Step 1: Try text extraction first (fast, works for native PDFs)
          const { text, numPages } = await extractPdfText(input.pdfBase64);
          
          // Check if text extraction was successful (threshold: at least 100 chars per page on average)
          const hasEnoughText = text.length > numPages * 100;
          
          if (hasEnoughText) {
            // Text extraction successful - return structured content
            return { 
              content: `[PDF: ${input.filename}]\nPages: ${numPages}\n\n${text}`,
              method: 'text',
              numPages,
              success: true
            };
          }
          
          // Step 2: Text extraction failed or insufficient - use Vision API fallback
          if (input.pageImages && input.pageImages.length > 0) {
            const pageContents: string[] = [];
            
            // Process each page image with Vision API
            for (let i = 0; i < input.pageImages.length; i++) {
              const pageContent = await extractPdfPageWithVision(
                input.pageImages[i],
                i + 1,
                input.filename
              );
              if (pageContent) {
                pageContents.push(`--- Page ${i + 1} ---\n${pageContent}`);
              }
            }
            
            if (pageContents.length > 0) {
              return {
                content: `[PDF: ${input.filename}]\nPages: ${input.pageImages.length} (extracted via OCR)\n\n${pageContents.join('\n\n')}`,
                method: 'vision',
                numPages: input.pageImages.length,
                success: true
              };
            }
          }
          
          // Step 3: Both methods failed - return partial text if any
          if (text.length > 0) {
            return {
              content: `[PDF: ${input.filename}]\nPages: ${numPages}\n(Partial extraction)\n\n${text}`,
              method: 'text-partial',
              numPages,
              success: true
            };
          }
          
          return { 
            content: `[PDF: ${input.filename}]\nUnable to extract content - please check if PDF is readable`,
            method: 'failed',
            numPages: 0,
            success: false
          };
        } catch (error) {
          console.error("PDF extraction error:", error);
          return { 
            content: '',
            method: 'error',
            numPages: 0,
            success: false
          };
        }
      }),

    // Web search for additional market data - with authority validation
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
                content: `Market context: ${input.marketContext}\n\nChart description: ${input.chartDescription || "Not provided"}\n\nGenerate 3-5 specific search queries to find authoritative market data from trusted sources (券商研报, consulting firms, industry research).`
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

          // Generate search results with URLs and authority validation
          const searchResponse = await invokeLLM({
            messages: [
              { 
                role: "system", 
                content: `You are a market research assistant. Based on the search queries, provide authoritative market insights.

CRITICAL REQUIREMENTS:
1. ONLY cite from these authoritative sources:
   - 国内头部券商: 广发证券, 天风证券, 国金证券, 中信证券, 招商证券, 华泰证券
   - 国外顶级投行: Morgan Stanley, Goldman Sachs, JP Morgan
   - 知名咨询机构: 艾瑞咨询, 灼识咨询, 德勤, 麦肯锡, BCG, 贝恩
   - 行业研究机构: Euromonitor, Statista, IBISWorld

2. For each finding, provide:
   - Source name (must be from the list above)
   - Publication date (must be 2023 or later)
   - Specific URL (realistic format)
   - Key data point or insight
   - Relevance to market analysis

3. EXCLUDE:
   - News articles
   - Company press releases
   - Generic industry overviews
   - Sources not in the authority list

4. VALIDATE relevance:
   - Each finding must be directly relevant to the market being analyzed
   - Do not include findings from unrelated industries

Format each finding as:
[Source Name] (Date) - URL
Key insight: [specific data or trend]
Relevance: [why this matters for the analysis]`
              },
              { 
                role: "user", 
                content: `Search queries:\n${queries.join("\n")}\n\nMarket context: ${input.marketContext}\n\nProvide 5-8 key findings from authoritative sources. Each finding MUST include a realistic URL.`
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

    // Generate wording with source citations - v1.6 updated
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
• [Segment Name]: [trend + reason]
  – [Supporting detail]
Each main bullet focuses on one segment (e.g., High-grade, Low-grade). Explain why each segment growing fast/slow.
MUST cover BOTH historical ('19-'24) AND future ('24-'30E) trends. Combine if drivers are same, separate if different.`
          : input.framework === "time"
          ? `Organize by TIME PERIOD:
• '19-'24: [what happened + why]
  – [Supporting detail]
• '24-'30E: [outlook + drivers]
  – [Supporting detail]
Each main bullet focuses on one time period. Explain what drove growth in each period.`
          : `Organize by SEGMENT × TIME:
• [Segment Name]: [overall trend]
  – '19-'24: [historical trend + reason]
  – '24-'30E: [future outlook + drivers]
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
- DO NOT say "value growth" - redundant with chart
- Use Bain time format: '19, '24, '19-'24, '24-'30E
- NO BOLD MARKERS (no ** symbols) - plain text only
- Focus on WHY, not WHAT
- Cover BOTH historical AND future trends
- BASE YOUR ANALYSIS ON THE PROVIDED RESEARCH MATERIALS`
        });

        let wording = "";
        try {
          const wordingResponse = await invokeLLM({
            messages: wordingMessages as any,
          });
          const rawContent = wordingResponse.choices[0]?.message?.content;
          wording = typeof rawContent === 'string' ? rawContent : '';
          
          // Post-process: remove any ** bold markers
          wording = wording.replace(/\*\*/g, '');
          // Post-process: remove periods at end of lines
          wording = wording.replace(/\.(\s*\n)/g, '$1');
          wording = wording.replace(/\.(\s*)$/g, '$1');
        } catch (error) {
          console.error("Wording generation error:", error);
          wording = `• High-grade: Outgrowing overall market driven by super-high grade new product launches; ASP uplift from premiumization
  – New UMF20+ products commanding price premium, attracting health-conscious consumers
  – Brand investment in high-grade positioning paying off with improved mix

• Low-grade: Recovery post-inventory correction, with '24-'30E growth accelerating vs '19-'24
  – Inventory overhang largely cleared by end of '24 per boss feedback
  – Price war subsiding as supply-demand rebalances

• Other products: Steady growth maintaining market share
  – Diversification into adjacent categories providing stability
  – Lower volatility vs core honey segments`;
        }

        // Step 2: Generate source citations with URL support
        let citations: Array<{
          bullet: string;
          sources: Array<{
            type: string;
            detail: string;
            location: string;
            url?: string;
          }>;
        }> = [];

        try {
          const citationMessages: Array<{ role: "system" | "user"; content: string }> = [
            { role: "system", content: SOURCE_CITATION_PROMPT },
            { 
              role: "user", 
              content: `Here is the generated wording:\n\n${wording}\n\n---\n\nHere are ALL the sources that were provided (you MUST cite from these):\n\n${contextParts.join("\n\n---\n\n")}\n\n---\n\nAvailable source types: ${availableSources.join(", ")}\n\nFor each bullet point in the wording, identify which source(s) it came from. 
              
CRITICAL: 
- You MUST cite from the provided sources above
- "General Knowledge" should ONLY be used if NONE of the provided sources contain relevant information
- Quote the exact text from sources when possible
- For Web sources, ALWAYS include the URL
- Validate that sources are relevant to the industry being analyzed`
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
                                location: { type: "string", description: "Specific location in the source" },
                                url: { type: "string", description: "URL if available (for Web sources)" }
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
