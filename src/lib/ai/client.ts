import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import { GoogleGenAI } from "@google/genai";
import { buildPlanPrompt, PlanInput, buildDecomposePrompt, DecomposeInput, buildNodeBreakdownPrompt, NodeBreakdownInput } from './prompts';
import { WeeklyPlanSchema, LevelsArraySchema, NodeBreakdownResponseSchema, DecodedPlan, DecodedLevel, DecodedNodeBreakdown } from './schemas';
export { MAX_NODE_DEPTH } from '../constants';

const GEMINI_API_KEY =
  process.env.GEMINI_API_KEY ||
  process.env.VITE_GEMINI_API_KEY ||
  process.env.GOOGLE_API_KEY ||
  process.env.GEMINI_KEY ||
  process.env.API_KEY;

const MODEL_CANDIDATES = [
  process.env.GEMINI_MODEL,
  'gemini-3.1-flash-lite',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
].filter((m): m is string => Boolean(m));
const MODELS = Array.from(new Set(MODEL_CANDIDATES));

const ai = GEMINI_API_KEY
  ? new GoogleGenAI({
      apiKey: GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    })
  : null;

function missingKeyError(feature: string): Error {
  return new Error(
    `Gemini API key is not configured. Add GEMINI_API_KEY to a .env.local file in the project root ` +
    `(get one free at https://aistudio.google.com/app/apikey) to activate ${feature}, then restart the dev server.`
  );
}

function classifyGeminiError(err: any): Error {
  const message = String(err?.message || err || '');
  const status = err?.status || err?.code;

  if (status === 401 || status === 403 || /API key not valid|PERMISSION_DENIED|invalid.*key/i.test(message)) {
    return new Error(
      'Gemini rejected the configured API key (invalid or missing permissions). ' +
      'Double-check GEMINI_API_KEY in .env.local against https://aistudio.google.com/app/apikey.'
    );
  }
  if (status === 429 || /RESOURCE_EXHAUSTED|quota/i.test(message)) {
    return new Error('Gemini rate limit or quota exceeded for this API key. Wait a moment and try again.');
  }
  if (status === 404 || /not found|NOT_FOUND/i.test(message)) {
    return new Error(`The Gemini model was not found or is no longer available (${message}).`);
  }
  return new Error(message || 'Unknown Gemini API error.');
}

function cleanJsonString(str: string): string {
  let cleaned = str.trim();
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.substring(7);
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.substring(3);
  }
  if (cleaned.endsWith("```")) {
    cleaned = cleaned.substring(0, cleaned.length - 3);
  }
  return cleaned.trim();
}

async function generateWithFallback(prompt: string): Promise<string> {
  if (!ai) throw missingKeyError('AI-powered features');

  let lastErr: any = null;
  for (const model of MODELS) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: { responseMimeType: 'application/json' },
      });
      return response.text || '';
    } catch (err: any) {
      lastErr = err;
      console.warn(`Gemini call failed for model "${model}", trying next candidate...`, err?.message || err);
    }
  }
  throw classifyGeminiError(lastErr);
}

export async function generatePlan(input: PlanInput): Promise<DecodedPlan> {
  const prompt = buildPlanPrompt(input);

  try {
    const text = await generateWithFallback(prompt);
    const jsonParsed = JSON.parse(cleanJsonString(text));
    return WeeklyPlanSchema.parse(jsonParsed);
  } catch (err: any) {
    console.warn("Weekly plan generation first attempt failed, retrying once...", err.message);

    const retryPrompt = `${prompt}\n\nNOTE: The previous attempt failed validation with error: ${err.message}. Please fix the structure and ensure all estimated_minutes are strictly between 20 and 30.`;
    try {
      const text = await generateWithFallback(retryPrompt);
      const jsonParsed = JSON.parse(cleanJsonString(text));
      return WeeklyPlanSchema.parse(jsonParsed);
    } catch (retryErr: any) {
      console.error("Weekly plan generation failed after retry logic:", retryErr);
      throw new Error(`Failed to generate custom weekly plan: ${retryErr.message || retryErr}`);
    }
  }
}

function sanitizeLevels(jsonParsed: any): any {
  if (!Array.isArray(jsonParsed)) return jsonParsed;
  return jsonParsed.map((item: any, idx: number) => {
    let b = item.branch;
    if (typeof b === 'string') {
      b = b.toLowerCase().trim();
    }
    if (b !== 'academic' && b !== 'light' && b !== 'activity' && b !== 'custom') {
      b = 'academic';
    }

    let mins = parseInt(item.estimated_minutes, 10);
    if (isNaN(mins)) {
      mins = 25;
    } else {
      mins = Math.max(20, Math.min(30, mins));
    }

    return {
      title: item.title || `Milestone ${idx + 1}`,
      description: item.description || `Execute plan objectives for milestone ${idx + 1}.`,
      estimated_minutes: mins,
      branch: b,
      branch_order: typeof item.branch_order === 'number' ? item.branch_order : idx + 1
    };
  });
}

export async function decomposeTasks(input: DecomposeInput): Promise<DecodedLevel[]> {
  const prompt = buildDecomposePrompt(input);

  try {
    const text = await generateWithFallback(prompt);
    const jsonParsed = sanitizeLevels(JSON.parse(cleanJsonString(text)));
    return LevelsArraySchema.parse(jsonParsed);
  } catch (err: any) {
    console.warn("Task decomposition first attempt failed, retrying once...", err.message);

    const retryPrompt = `${prompt}\n\nNOTE: The previous attempt failed validation with error: ${err.message}. Ensure estimated_minutes are strictly between 20 and 30 for all items in the array.`;
    try {
      const text = await generateWithFallback(retryPrompt);
      const jsonParsed = sanitizeLevels(JSON.parse(cleanJsonString(text)));
      return LevelsArraySchema.parse(jsonParsed);
    } catch (retryErr: any) {
      console.error("Task decomposition failed after retry logic:", retryErr);
      throw new Error(`Failed to decompose custom tasks: ${retryErr.message || retryErr}`);
    }
  }
}

// Powers "Break Down Further" on a single node. Returns either a small set
// of sub-steps, or sufficientAlready=true, which the route turns into the
// "that's enough — try it, and research further if you get stuck" message
// instead of a fabricated breakdown.
export async function decomposeNodeFurther(input: NodeBreakdownInput): Promise<DecodedNodeBreakdown> {
  const prompt = buildNodeBreakdownPrompt(input);

  try {
    const text = await generateWithFallback(prompt);
    const jsonParsed = JSON.parse(cleanJsonString(text));
    if (Array.isArray(jsonParsed?.levels)) {
      jsonParsed.levels = sanitizeLevels(jsonParsed.levels);
    }
    return NodeBreakdownResponseSchema.parse(jsonParsed);
  } catch (err: any) {
    console.error("Node breakdown failed:", err);
    throw new Error(`Failed to break this step down further: ${err.message || err}`);
  }
}
