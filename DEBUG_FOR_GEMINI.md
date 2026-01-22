# Market Wording Copilot - Debug Document for Gemini

## Problem Summary

The wording generation feature is failing with `hasChoices: false` error from LLM API, causing the system to return hardcoded fallback wording (grade-based) instead of the correct time-based wording.

## Expected Behavior

When user uploads the Manuka Honey chart (total bars only, no stacked breakdown), the system should:
1. Detect chart structure as `total_only`
2. Generate time-based wording with L1 bullets like:
   - Pre-COVID ('19-'21): ...
   - COVID ('21-'23): ...
   - Post-COVID ('23-'24E): ...

## Actual Behavior

System returns hardcoded fallback wording with grade-based L1 bullets:
- High-grade: ...
- Low-grade: ...
- Other products: ...

## Root Cause Analysis

### Error Logs
```
[Step 1] Extracted metadata: { country: 'Greater China', industry: 'Mānuka Honey retail' }
[Step 2] Detected structure: { type: 'total_only', breakdown: [] }
[Wording Generation] Sending request with 2 messages
[Wording Generation] Message structure: [
  { index: 0, role: 'system', contentType: 'string', isArray: false, contentLength: 10235 },
  { index: 1, role: 'user', contentType: 'object', isArray: true, contentLength: 2 }
]
[Wording Generation] Response received: {"hasChoices":false,"firstChoice":"missing"}
Wording generation error: TypeError: Cannot read properties of undefined (reading '0')
```

### Key Observations
1. **Step 1 & 2 work correctly** - Chart structure is detected as `total_only`
2. **Message structure looks correct** - Only 2 messages (system + user), no consecutive user messages
3. **LLM API returns empty response** - `hasChoices: false` indicates API rejected the request
4. **Fallback wording is triggered** - Error handling returns hardcoded grade-based example (line 975-985 in routers.ts)

### Suspected Issues

**Issue 1: `response_format` incompatibility with multimodal content**
- Line 941-958 in `server/routers.ts` uses `json_schema` response format
- This may not be compatible with multimodal messages (image + text array)
- OpenAI API might reject requests with `json_schema` + image content

**Issue 2: Message content structure**
- User message has array content: `[{ type: "text", text: "..." }, { type: "image_url", image_url: { url: "..." } }]`
- Combined with `json_schema` response format, this might violate API constraints

**Issue 3: Content length**
- System message: 10,235 chars
- User message text parts: Chart analysis + Research materials + Framework instruction (potentially very long)
- Total context might exceed API limits when combined with image

## Code Location

### Main File: `server/routers.ts`

**Wording Generation (Line 817-980):**
```typescript
// Line 817-935: Build wordingMessages
const wordingMessages = [
  { role: "system", content: BAIN_WORDING_SYSTEM_PROMPT_V3 },
  { 
    role: "user", 
    content: [
      { type: "text", text: userMessageTextParts.join("") },
      { type: "image_url", image_url: { url: input.chartImage } }
    ]
  }
];

// Line 938-960: LLM API call with json_schema
const wordingResponse = await invokeLLM({
  messages: wordingMessages as any,
  response_format: {
    type: "json_schema",
    json_schema: {
      name: "wording_output",
      strict: true,
      schema: {
        type: "object",
        properties: {
          wording: { type: "string" },
          evidence_status: { type: "string", enum: ["sufficient", "limited"] },
          risk_tag: { type: ["string", "null"] },
          verification_urls: { type: "array", items: { type: "string" } }
        },
        required: ["wording", "evidence_status"],
        additionalProperties: false
      }
    }
  }
});

// Line 973-986: Error handling with hardcoded fallback
catch (error) {
  console.error("Wording generation error:", error);
  wording = `• High-grade: Outgrowing overall market...
• Low-grade: Recovery post-inventory correction...
• Other products: Steady growth maintaining...`;
}
```

## Proposed Solutions

### Solution 1: Remove `response_format` for multimodal requests
```typescript
const wordingResponse = await invokeLLM({
  messages: wordingMessages as any,
  // Remove response_format when using image content
});
// Parse wording from plain text response instead of JSON
```

### Solution 2: Separate image analysis from wording generation
```typescript
// Step 1: Analyze chart (with image)
const chartAnalysis = await invokeLLM({
  messages: [
    { role: "system", content: "Analyze this chart..." },
    { role: "user", content: [{ type: "image_url", ... }] }
  ]
});

// Step 2: Generate wording (text only, with json_schema)
const wordingResponse = await invokeLLM({
  messages: [
    { role: "system", content: BAIN_WORDING_SYSTEM_PROMPT_V3 },
    { role: "user", content: `Chart analysis: ${chartAnalysis}\n\n${frameworkInstruction}` }
  ],
  response_format: { type: "json_schema", ... }
});
```

### Solution 3: Use simpler response format
```typescript
const wordingResponse = await invokeLLM({
  messages: wordingMessages as any,
  response_format: { type: "json_object" }  // Less strict than json_schema
});
```

## Test Case

**Input:**
- Chart: Manuka Honey (total bars, 2019-2024)
- Industry: "Mānuka Honey" or "Manuka Honey"
- Web Search: Enabled

**Expected Output:**
```
• Pre-COVID ('19-'20): Market decline driven by...
  – Detail 1
  – Detail 2

• COVID ('20-'22): Surge in demand due to...
  – Detail 1
  – Detail 2

• Post-COVID ('22-'24E): Stabilization with...
  – Detail 1
  – Detail 2
```

**Current Output (Wrong):**
```
• High-grade: Outgrowing overall market driven by...
• Low-grade: Recovery post-inventory correction...
• Other products: Steady growth maintaining...
```

## Debug Steps for Gemini

1. **Verify API compatibility:**
   - Check if `json_schema` response format is compatible with multimodal messages
   - Test with and without `response_format`

2. **Check message structure:**
   - Verify array content format is correct for OpenAI API
   - Test with text-only message vs multimodal message

3. **Inspect actual API error:**
   - Add logging to capture full API error response (not just `hasChoices: false`)
   - Check if there's an error message explaining why request was rejected

4. **Test workarounds:**
   - Try Solution 1: Remove `response_format`
   - Try Solution 2: Separate image analysis
   - Try Solution 3: Use `json_object` instead of `json_schema`

5. **Fix fallback behavior:**
   - Replace hardcoded fallback with dynamic generation
   - Or remove fallback entirely to surface actual errors

## Additional Context

**Working test script** (`test-manuka.mjs`):
- Successfully generates time-based wording when run directly
- Uses same API calls but different execution context
- This suggests the issue is specific to the web UI flow

**Framework detection works:**
- Step 1 correctly extracts country + industry
- Step 2 correctly detects `total_only` structure
- Framework instruction is correctly generated
- Only the final LLM call fails

## Files to Review

1. `server/routers.ts` (Line 817-1050) - Main wording generation logic
2. `server/prompts.ts` - System prompts and framework instructions
3. `server/_core/llm.ts` - LLM invocation wrapper
4. `.manus-logs/devserver.log` - Server logs with error details

## Contact

If you need more information or have questions, please check:
- Server logs: `.manus-logs/devserver.log`
- Test results: Run `pnpm test` (all 49 tests pass)
- Live debugging: Add `console.log` in `server/routers.ts` line 938-980
