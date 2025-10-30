// src/services/AIService.ts

import { Settings } from '../types';

interface Provider {
  name: string;
  endpoint: string;
  defaultModel: string;
  requiresKey: boolean;
}

const Providers: Record<string, Provider> = {
  groq: {
    name: 'Groq',
    endpoint: 'https://api.groq.com/openai/v1/chat/completions',
    defaultModel: 'llama-3.3-70b-versatile',
    requiresKey: true,
  },
  deepseek: {
    name: 'DeepSeek',
    endpoint: 'https://router.huggingface.co/v1',
    defaultModel: 'deepseek-ai/DeepSeek-V3.2-Exp:novita',
    requiresKey: true,
  },
  huggingface: {
    name: 'Hugging Face',
    endpoint: 'https://api-inference.huggingface.co/models/',
    defaultModel: 'google/flan-t5-base',
    requiresKey: true,
  },
  openai: {
    name: 'OpenAI',
    endpoint: 'https://api.openai.com/v1/chat/completions',
    defaultModel: 'gpt-3.5-turbo',
    requiresKey: true,
  },
  local: {
    name: 'Local (No API)',
    endpoint: '',
    defaultModel: '',
    requiresKey: false,
  },
};

export class AIService {
  static async callProvider(
    settings: Settings,
    prompt: string,
    userText: string,
    format: string = 'text',
    onProgress?: (progress: number) => void
  ): Promise<string> {
    const provider = settings.provider;

    if (!provider || provider === 'local') {
      return this.localProcessing(userText, format);
    }

    const config = Providers[provider];
    if (!config) {
      throw new Error('Invalid provider selected');
    }

    if (config.requiresKey && !settings.apiKey) {
      throw new Error(`API key required for ${config.name}. Please configure in AI Settings.`);
    }

    const model = settings.model || config.defaultModel;
    const endpoint = settings.customUrl || config.endpoint;

    if (onProgress) onProgress(10);

    try {
      if (provider === 'deepseek') {
        return await this.callDeepSeek(endpoint, model, settings.apiKey, prompt, userText, format, onProgress);
      } else if (provider === 'huggingface') {
        return await this.callHuggingFace(endpoint, model, settings.apiKey, prompt, userText, format, onProgress);
      } else {
        return await this.callOpenAICompatible(endpoint, model, settings.apiKey, prompt, userText, format, onProgress);
      }
    } catch (error) {
      if (onProgress) onProgress(0);
      throw error;
    }
  }

  private static async callOpenAICompatible(
    endpoint: string,
    model: string,
    apiKey: string,
    prompt: string,
    userText: string,
    format: string,
    onProgress?: (progress: number) => void
  ): Promise<string> {
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    };

    const enhancedPrompt = this.enhancePromptForFormat(prompt, format);

    const body = {
      model,
      messages: [
        {
          role: 'system',
          content: 'You are a text formatting assistant. Apply instructions exactly. Output only formatted text with no explanation.',
        },
        {
          role: 'user',
          content: `${enhancedPrompt}\n\nText to process:\n${userText}`,
        },
      ],
      temperature: 0.3,
      max_tokens: 4096,
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        let errorMsg = `API Error (${response.status})`;
        try {
          const errorData = await response.json();
          errorMsg = errorData.error?.message || errorData.message || JSON.stringify(errorData);
        } catch (e) {
          errorMsg += `: ${await response.text().catch(() => 'Unknown error')}`;
        }
        throw new Error(errorMsg);
      }

      const data = await response.json();
      if (onProgress) onProgress(90);

      return data.choices?.[0]?.message?.content || '';
    } catch (error: any) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error('Request timeout - please try again');
      }
      throw error;
    }
  }

  private static async callDeepSeek(
    endpoint: string,
    model: string,
    apiKey: string,
    prompt: string,
    userText: string,
    format: string,
    onProgress?: (progress: number) => void
  ): Promise<string> {
    return this.callOpenAICompatible(
      endpoint + '/chat/completions',
      model,
      apiKey,
      prompt,
      userText,
      format,
      onProgress
    );
  }

  private static async callHuggingFace(
    endpoint: string,
    model: string,
    apiKey: string,
    prompt: string,
    userText: string,
    format: string,
    onProgress?: (progress: number) => void
  ): Promise<string> {
    const headers = {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    };

    const enhancedPrompt = this.enhancePromptForFormat(prompt, format);
    const fullPrompt = `${enhancedPrompt}\n\nText to format:\n${userText}\n\nFormatted text:`;

    const body = {
      inputs: fullPrompt,
      parameters: {
        max_new_tokens: 4096,
        temperature: 0.3,
        do_sample: true,
        return_full_text: false,
      },
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45000);

    try {
      const response = await fetch(endpoint + model, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        let errorMsg = `Hugging Face API Error (${response.status})`;
        try {
          const errorData = await response.json();
          if (errorData.error && errorData.error.includes('loading')) {
            const estimatedTime = errorData.estimated_time || 30;
            errorMsg = `Model is loading. Please try again in about ${Math.ceil(estimatedTime)} seconds.`;
          } else {
            errorMsg = errorData.error || errorData.message || JSON.stringify(errorData);
          }
        } catch (e) {
          errorMsg += `: ${await response.text().catch(() => 'Unknown error')}`;
        }
        throw new Error(errorMsg);
      }

      const data = await response.json();
      if (onProgress) onProgress(90);

      if (Array.isArray(data) && data[0] && data[0].generated_text) {
        return data[0].generated_text;
      } else if (data.generated_text) {
        return data.generated_text;
      } else {
        return JSON.stringify(data);
      }
    } catch (error: any) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error('Request timeout - please try again');
      }
      throw error;
    }
  }

  private static enhancePromptForFormat(prompt: string, format: string): string {
    const formatInstructions: Record<string, string> = {
      markdown: 'Format the output as clean Markdown with proper headings, lists, and emphasis.',
      html: 'Convert to clean HTML with proper semantic tags. Use paragraphs, lists, and tables where appropriate.',
      latex: 'Convert to LaTeX format with proper document structure, sections, and mathematical notation if needed.',
      text: 'Output clean, well-formatted plain text with proper paragraphs and spacing.',
    };

    const instruction = formatInstructions[format] || '';
    return instruction ? `${prompt}\n\n${instruction}` : prompt;
  }

  private static localProcessing(text: string, format: string): string {
    let processed = text
      .replace(/\r\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]+/g, ' ')
      .replace(/^\s+|\s+$/gm, '')
      .trim();

    if (format === 'markdown') {
      processed = this.convertToMarkdown(processed);
    } else if (format === 'html') {
      processed = this.convertToHTML(processed);
    }

    return processed;
  }

  private static convertToMarkdown(text: string): string {
    return text
      .replace(/^(#+)\s*(.*)$/gm, '# $2')
      .replace(/\n{2,}/g, '\n\n')
      .replace(/^\s*[-*]\s+/gm, '- ')
      .replace(/\b(\d+)\.\s+/g, '$1. ')
      .trim();
  }

  private static convertToHTML(text: string): string {
    const paragraphs = text.split('\n\n');
    let html = '';
    
    for (const para of paragraphs) {
      if (!para.trim()) continue;
      
      // Check if it's a list
      if (/^\s*[-*]\s+/.test(para)) {
        const items = para.split('\n').filter(line => line.trim());
        html += '<ul>\n';
        for (const item of items) {
          const cleanItem = item.replace(/^\s*[-*]\s+/, '');
          html += `  <li>${cleanItem}</li>\n`;
        }
        html += '</ul>\n';
      } else {
        html += `<p>${para}</p>\n`;
      }
    }
    
    return html;
  }

  static async testConnection(settings: Settings): Promise<boolean> {
    const testPrompt = 'Respond with exactly: TEST OK';
    const testText = 'test';

    try {
      const result = await this.callProvider(settings, testPrompt, testText);
      // Ensure we always return a boolean
      return !!result && result.includes('TEST OK');
    } catch (error: any) {
      if (error.message.includes('loading')) {
        throw new Error('Model is loading, please try again in a moment');
      }
      throw error;
    }
  }
}