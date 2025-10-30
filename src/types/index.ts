// src/types/index.ts

export interface Document {
  id: string;
  name: string;
  size: number;
  type: string;
  uploadedAt: number;
  extractedText: string;
  processedResult?: string;
  status: 'uploaded' | 'processing' | 'ready' | 'error';
  file: File;
}

export interface Settings {
  provider: string;
  apiKey: string;
  model: string;
  customUrl: string;
  customHeader: string;
  saveKey: boolean;
}

export interface PromptTemplate {
  id: string;
  name: string;
  prompt: string;
  created: number;
}

export interface ChatMessage {
  content: string;
  sender: 'user' | 'ai';
  timestamp: number;
  isError?: boolean;
}

export interface ToastMessage {
  id: string;
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
}

export interface Template {
  id: string;
  name: string;
  category: string;
  description: string;
  prompt: string;
  preview?: string;
}

export type StatusType = 'ready' | 'processing' | 'error';

export interface Status {
  text: string;
  type: StatusType;
}