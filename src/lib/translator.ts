import { GoogleGenAI, Type } from '@google/genai/web';
import Parser from 'srt-parser-2';

export interface Subtitle {
  id: string;
  startTime: string;
  startSeconds: number;
  endTime: string;
  endSeconds: number;
  text: string;
}

export type TranslationStatus = 'idle' | 'translating' | 'done' | 'error';

export interface TranslatorOptions {
  apiKey: string;
  targetLanguage?: string;
  model?: 'gemini-2.5-flash' | 'gemini-2.5-pro' | 'gemini-3.1-pro-preview' | 'gemini-3-flash-preview';
  batchSize?: number;
  contextWindow?: number;
  movieContext?: string;
  tone?: string;
  onProgress: (current: number, total: number, translatedBatch: Subtitle[]) => void;
}

export interface TranslationEvaluation {
  score: number;
  comments: string;
  suggestions: { original: string, current: string, suggestion: string, reason: string }[];
}

export class SrtTranslator {
  private parser: Parser;
  private ai: GoogleGenAI;

  constructor() {
    this.parser = new Parser();
    this.ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
  }

  setApiKey(key: string) {
    this.ai = new GoogleGenAI({ apiKey: key });
  }

  parse(srtText: string): Subtitle[] {
    return this.parser.fromSrt(srtText);
  }

  stringify(subtitles: Subtitle[]): string {
    return this.parser.toSrt(subtitles);
  }

  async translateBatch(
    subtitles: Subtitle[],
    batchLines: Subtitle[],
    prevContext: Subtitle[],
    nextContext: Subtitle[],
    targetLanguage: string,
    model: string,
    movieContext?: string,
    tone?: string
  ): Promise<string[]> {
    const prompt = `You are a professional subtitle translator. Your task is to translate an array of subtitle lines into ${targetLanguage}.

Movie/Video Context:
${movieContext || '(No global context provided)'}

Tone/Style:
${tone || 'Natural and appropriate to the context'}

Instructions:
1. Translate the given subtitle lines into natural, conversational ${targetLanguage}, avoiding literal "word-by-word" translation.
2. Adjust pronouns and addressing (xưng hô) automatically based on the relationship and situation (e.g., in Vietnamese use mày/tao for fights/gangsters, tôi/bạn for normal, anh/em for couples, etc., depending on the current context).
3. Preserve the desired tone throughout the translation.

--- PREVIOUS CONTEXT ---
${prevContext.map(s => s.text).join('\n') || '(None)'}

--- NEXT CONTEXT ---
${nextContext.map(s => s.text).join('\n') || '(None)'}

--- LINES TO TRANSLATE ---
Translate the following ${batchLines.length} lines exactly. Consider the context and instructions provided above to ensure natural phrasing, correct gender/pronouns, and accurate tone.
${batchLines.map((s, i) => `Line ${i + 1}: ${s.text}`).join('\n')}

Return ONLY a JSON array of strings, where each string is the translation of the corresponding line. The length of the array MUST be exactly ${batchLines.length}. DO NOT combine lines. Maintain the same formatting (e.g., italic tags <i>...</i> or newlines if present).`;

    const response = await this.ai.models.generateContent({
      model: model,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.STRING
          }
        },
        temperature: 0.3, // Lower temperature for more accurate translation
      }
    });

    const text = response.text || '';
    try {
      const result = JSON.parse(text);
      if (Array.isArray(result) && result.length === batchLines.length) {
        return result;
      }
      if (Array.isArray(result)) {
        // Trim or pad to match
        return result.slice(0, batchLines.length).concat(Array(Math.max(0, batchLines.length - result.length)).fill(''));
      }
      return batchLines.map(() => '');
    } catch (e) {
      console.error('Failed to parse response', text);
      return batchLines.map(() => '');
    }
  }

  async translate(
    srtText: string,
    options: TranslatorOptions
  ): Promise<Subtitle[]> {
    if (options.apiKey) {
      this.setApiKey(options.apiKey);
    } else if (!process.env.GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY is not defined.");
    }

    const subtitles = this.parse(srtText);
    const translatedSubtitles = [...subtitles];
    
    const batchSize = options.batchSize || 30;
    const contextWindow = options.contextWindow || 20;
    const targetLang = options.targetLanguage || 'Vietnamese';
    const model = options.model || 'gemini-2.5-pro';
    const movieContext = options.movieContext;
    const tone = options.tone;

    for (let i = 0; i < subtitles.length; i += batchSize) {
      const batchLines = subtitles.slice(i, i + batchSize);
      
      const prevStart = Math.max(0, i - contextWindow);
      const prevContext = subtitles.slice(prevStart, i);
      
      const nextEnd = Math.min(subtitles.length, i + batchSize + contextWindow);
      const nextContext = subtitles.slice(i + batchSize, nextEnd);

      let success = false;
      let retries = 3;
      
      while (!success && retries > 0) {
        try {
          const translations = await this.translateBatch(
            subtitles,
            batchLines,
            prevContext,
            nextContext,
            targetLang,
            model,
            movieContext,
            tone
          );

          for (let j = 0; j < batchLines.length; j++) {
            translatedSubtitles[i + j].text = translations[j] || batchLines[j].text;
          }
          success = true;
        } catch (error) {
          retries--;
          console.error(`Batch ${i} failed. Retries left: ${retries}`, error);
          if (retries === 0) {
            // Fill with original text if failed completely
            for (let j = 0; j < batchLines.length; j++) {
              translatedSubtitles[i + j].text = batchLines[j].text;
            }
          }
        }
      }

      options.onProgress(Math.min(i + batchSize, subtitles.length), subtitles.length, translatedSubtitles.slice(0, i + batchSize));
    }

    return translatedSubtitles;
  }

  async rewriteSubtitle(
    original: string,
    currentTranslation: string,
    targetLanguage: string,
    movieContext: string,
    tone: string,
    model: string
  ): Promise<string> {
    const prompt = `You are a professional subtitle translator. You are asked to review and rewrite a single subtitle line to make it sound more natural and appropriate for the context.

Movie/Video Context:
${movieContext || '(No global context provided)'}

Tone/Style:
${tone || 'Natural and appropriate to the context'}

Original text:
"""
${original}
"""

Current Translation (${targetLanguage}):
"""
${currentTranslation}
"""

Task:
Rewrite the Current Translation so that it flows more naturally in ${targetLanguage}, isn't translated word-by-word, and perfectly matches the tone and context. Keep the formatting (italics, line breaks) identical.

Return ONLY the rewritten translated text as a plain string, with no quotes or extra formatting around it.`;

    const response = await this.ai.models.generateContent({
      model: model,
      contents: prompt,
      config: {
        temperature: 0.5,
      }
    });

    let result = response.text || '';
    result = result.replace(/^```[a-z]*\n/g, '').replace(/\n```$/g, '').trim();
    return result;
  }

  async summarizeSubtitles(
    subtitles: Subtitle[],
    movieContext: string,
    model: string = 'gemini-2.5-flash'
  ): Promise<string> {
    const fullText = subtitles.map(s => s.text).join(' ');
    const prompt = `You are an expert film analyst. Please read the following subtitle script and provide a brief summary of the movie/video plot.
    
Context/Background provided:
${movieContext || '(None)'}

Subtitle Script:
${fullText}

Please provide a concise but comprehensive summary of the story based on these subtitles. Write the summary prioritizing the provided context language, and provide insight into the main characters and plot points. Note: Depending on the length of the script, it could be cut short, so summarize what is available.`;

    const response = await this.ai.models.generateContent({
      model: model,
      contents: prompt,
      config: {
        temperature: 0.7,
      }
    });

    return response.text || '';
  }

  async evaluateTranslation(
    originalSubtitles: Subtitle[],
    translatedSubtitles: Subtitle[],
    targetLanguage: string,
    movieContext: string,
    model: string = 'gemini-2.5-flash'
  ): Promise<TranslationEvaluation> {
    const sampleSize = Math.min(originalSubtitles.length, 50);
    const step = Math.max(1, Math.floor(originalSubtitles.length / sampleSize));
    
    const samples = [];
    for (let i = 0; i < originalSubtitles.length; i += step) {
      if (samples.length < sampleSize) {
        samples.push({
          line: i + 1,
          original: originalSubtitles[i].text,
          translated: translatedSubtitles[i].text
        });
      }
    }

    const prompt = `You are an expert subtitle translator and reviewer. Evaluate the following translation of a subtitle file into ${targetLanguage}.

Movie/Video Context:
${movieContext || '(No global context provided)'}

Sample pairs (Original -> Translated):
${samples.map(s => `[Line ${s.line}]: ${s.original} --> ${s.translated}`).join('\n')}

Based on these samples, evaluate the translation quality, considering naturalness, accuracy, tone consistency, and contextual appropriateness.

Return a JSON object with this exact structure:
{
  "score": <number from 1 to 10 evaluating the overall quality>,
  "comments": "<A summary paragraph describing the quality and areas of improvement in the target language (${targetLanguage})>",
  "suggestions": [
    {
      "original": "<original text>",
      "current": "<current translation>",
      "suggestion": "<better translation>",
      "reason": "<why the suggestion is better (in ${targetLanguage})>"
    }
  ]
}`;

    const response = await this.ai.models.generateContent({
      model: model,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            score: { type: Type.NUMBER },
            comments: { type: Type.STRING },
            suggestions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  original: { type: Type.STRING },
                  current: { type: Type.STRING },
                  suggestion: { type: Type.STRING },
                  reason: { type: Type.STRING }
                }
              }
            }
          }
        },
        temperature: 0.3,
      }
    });

    const text = response.text || '{}';
    try {
      return JSON.parse(text) as TranslationEvaluation;
    } catch(e) {
      console.error(e);
      return { score: 0, comments: 'Failed to parse evaluation response.', suggestions: [] };
    }
  }
}
