import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Upload, HelpCircle, Settings, Keyboard, BookOpen, Download, Moon, Sun, Send, Trash2, Copy, RefreshCw, Eye, FileText, Folder, X, Check, AlertCircle, Loader, Plus, Save, Lightbulb, TestTube, PlayCircle, MessageSquare } from 'lucide-react';
import './styles/globals.css';
import { OCRService } from './services/OCRService';
import { AIService } from './services/AIService';
import { StorageService } from './services/StorageService';

// Types
interface Document {
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

interface Settings {
  provider: string;
  apiKey: string;
  model: string;
  customUrl: string;
  customHeader: string;
  saveKey: boolean;
}

interface ChatMessage {
  content: string;
  sender: 'user' | 'ai';
  timestamp: number;
  isError?: boolean;
}

interface ToastMessage {
  id: string;
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
}

interface Template {
  id: string;
  name: string;
  category: string;
  description: string;
  prompt: string;
}

const AIFormatterPro: React.FC = () => {
  // State
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [inputText, setInputText] = useState('');
  const [outputText, setOutputText] = useState('');
  const [customPrompt, setCustomPrompt] = useState('');
  const [selectedPrompt, setSelectedPrompt] = useState('');
  const [documents, setDocuments] = useState<Document[]>([]);
  const [currentDoc, setCurrentDoc] = useState<Document | null>(null);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState({ text: 'Ready', type: 'ready' });
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [dragOver, setDragOver] = useState(false);
  
  // Modal states
  const [showHelp, setShowHelp] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showChat, setShowChat] = useState(false);
  
  // Settings
  const [settings, setSettings] = useState<Settings>({
    provider: '',
    apiKey: '',
    model: '',
    customUrl: '',
    customHeader: 'Authorization',
    saveKey: false
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatMessagesRef = useRef<HTMLDivElement>(null);
  const textInputRef = useRef<HTMLTextAreaElement>(null);

  // Prompt Templates
  const promptTemplates: Record<string, string> = {
    reflow: 'Fix spacing, dehyphenate words, merge broken lines, preserve bullets and tables. Do not summarize or change wording. Output only cleaned text.',
    'list-to-csv': 'Convert line-separated items into a single-line comma-separated list. Keep original order. Output only the list.',
    'fix-table': 'Detect and preserve table-like rows with columns separated by tabs. Fix broken cells and align columns. Output only the reformatted table.',
    'clean-email': 'Remove email headers, quotes, and formatting artifacts. Keep only the main message content. Output clean paragraphs.',
    markdown: 'Convert to clean Markdown format with proper headings, lists, emphasis, and code blocks.',
    html: 'Convert to semantic HTML with proper tags for paragraphs, headings, lists, and tables.',
    latex: 'Convert to LaTeX format with proper document structure and mathematical notation.'
  };

  const templates: Template[] = [
    {
      id: 'academic-paper',
      name: 'Academic Paper Format',
      category: 'formatting',
      description: 'Format text as an academic paper with proper sections and citations',
      prompt: 'Format this text as an academic paper. Include abstract, introduction, methods, results, and discussion sections.'
    },
    {
      id: 'business-report',
      name: 'Business Report',
      category: 'formatting',
      description: 'Convert text into a professional business report format',
      prompt: 'Format this text as a business report with executive summary, key findings, recommendations, and conclusion.'
    },
    {
      id: 'markdown-converter',
      name: 'Markdown Converter',
      category: 'conversion',
      description: 'Convert plain text to clean Markdown format',
      prompt: 'Convert this text to clean Markdown format with proper headings, lists, bold/italic emphasis, and code blocks.'
    }
  ];

  // Toast System
  const showToast = useCallback((message: string, type: ToastMessage['type'] = 'info') => {
    const id = Math.random().toString(36).slice(2);
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  }, []);

  // Load saved data
  useEffect(() => {
    const savedTheme = StorageService.load<'light' | 'dark'>('ai_formatter_theme', 'light') || 'light';
    setTheme(savedTheme);
    
    const savedSettings = StorageService.load<Settings>('ai_formatter_settings', {
      provider: '',
      apiKey: '',
      model: '',
      customUrl: '',
      customHeader: 'Authorization',
      saveKey: false
    });
    if (savedSettings && savedSettings.provider) {
      setSettings(savedSettings);
    }
    
    const savedChatHistory = StorageService.load<ChatMessage[]>('ai_formatter_chat_history', []);
    setChatHistory(savedChatHistory && savedChatHistory.length > 0 ? savedChatHistory : [
      { content: "Hello! I'm here to help. You can ask me anything about text formatting, prompts, or general assistance.", sender: 'ai', timestamp: Date.now() }
    ]);

    // Initialize OCR in background
    setTimeout(() => {
      OCRService.init().catch(() => {
        console.warn('OCR initialization failed');
      });
    }, 2000);

    // Cleanup on unmount
    return () => {
      OCRService.cleanup();
    };
  }, []);

  // Theme management
  useEffect(() => {
    StorageService.save('ai_formatter_theme', theme);
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Auto-scroll chat
  useEffect(() => {
    if (chatMessagesRef.current) {
      chatMessagesRef.current.scrollTop = chatMessagesRef.current.scrollHeight;
    }
  }, [chatHistory]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).matches('textarea, input, select')) return;
      
      const ctrlKey = e.ctrlKey || e.metaKey;
      
      if (ctrlKey && e.key === 'Enter') {
        e.preventDefault();
        processText();
      } else if (ctrlKey && e.key === '/') {
        e.preventDefault();
        setShowChat(true);
      } else if (ctrlKey && e.shiftKey && e.key === 'C') {
        e.preventDefault();
        copyOutput();
      } else if (e.key === 'Escape') {
        closeAllModals();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [outputText]);

  // Drag and drop handlers
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget === e.target) {
      setDragOver(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleFileUpload(files);
    }
  };

  const closeAllModals = () => {
    setShowHelp(false);
    setShowSettings(false);
    setShowShortcuts(false);
    setShowTemplates(false);
    setShowChat(false);
  };

  // File handling with OCR support
  const handleFileUpload = async (files: FileList | null) => {
    if (!files) return;
    const fileArray = Array.from(files);
    showToast(`Processing ${fileArray.length} file(s)...`, 'info');

    for (const file of fileArray) {
      try {
        let extractedText = '';
        const fileExtension = file.name.toLowerCase().split('.').pop() || '';
        
        // Create document entry immediately
        const doc: Document = {
          id: Math.random().toString(36).slice(2, 10),
          name: file.name,
          size: file.size,
          type: file.type,
          uploadedAt: Date.now(),
          extractedText: '',
          status: 'processing',
          file
        };

        setDocuments(prev => [doc, ...prev]);
        setStatus({ text: 'Processing file...', type: 'processing' });

        // Process based on file type
        if (file.type === 'application/pdf' || fileExtension === 'pdf') {
          extractedText = await OCRService.processPDF(file, (prog) => setProgress(prog));
        } else if (file.type.startsWith('image/') || ['jpg', 'jpeg', 'png', 'tiff', 'bmp', 'gif'].includes(fileExtension)) {
          extractedText = await OCRService.processImage(file, (prog) => setProgress(prog));
        } else if (file.type === 'text/plain' || fileExtension === 'txt') {
          extractedText = await file.text();
        } else {
          throw new Error(`Unsupported file type: ${file.type || fileExtension}`);
        }

        if (extractedText && extractedText.trim()) {
          // Update document
          doc.extractedText = extractedText;
          doc.status = 'ready';
          setDocuments(prev => prev.map(d => d.id === doc.id ? doc : d));

          // Add to input
          const separator = `\n\n--- ${file.name} ---\n`;
          setInputText(prev => prev ? `${prev}${separator}${extractedText}` : `${separator}${extractedText}`);
          
          setStatus({ text: 'Ready', type: 'ready' });
          setProgress(0);
          showToast(`Successfully processed ${file.name}`, 'success');
        } else {
          throw new Error('No text could be extracted');
        }
      } catch (error: any) {
        showToast(`Error processing ${file.name}: ${error.message}`, 'error');
        setDocuments(prev => prev.map(d => 
          d.name === file.name ? { ...d, status: 'error' as const } : d
        ));
        setStatus({ text: 'Ready', type: 'ready' });
        setProgress(0);
      }
    }
  };

  // AI Processing
  const processText = async () => {
    if (!inputText.trim()) {
      showToast('Please enter text or upload a document', 'warning');
      return;
    }

    if (!customPrompt.trim()) {
      showToast('Please select or enter a formatting prompt', 'warning');
      return;
    }

    setProcessing(true);
    setStatus({ text: 'Processing...', type: 'processing' });
    setProgress(10);

    try {
      const result = await AIService.callProvider(
        settings,
        customPrompt,
        inputText,
        'text',
        (prog) => setProgress(prog)
      );
      
      setOutputText(result);
      setProgress(100);
      setStatus({ text: 'Complete', type: 'ready' });
      showToast('Processing completed successfully', 'success');

      setTimeout(() => {
        setProgress(0);
        setStatus({ text: 'Ready', type: 'ready' });
      }, 2000);
    } catch (error: any) {
      setProgress(0);
      setStatus({ text: 'Failed', type: 'error' });
      showToast(`Processing failed: ${error.message}`, 'error');
    } finally {
      setProcessing(false);
    }
  };

  // Chat
  const sendChatMessage = async () => {
    if (!chatInput.trim()) return;

    if (!settings.provider || settings.provider === 'local') {
      showToast('Please configure an AI provider in Settings for chat', 'warning');
      return;
    }

    const userMessage: ChatMessage = {
      content: chatInput,
      sender: 'user',
      timestamp: Date.now()
    };

    setChatHistory(prev => [...prev, userMessage]);
    setChatInput('');

    try {
      const chatPrompt = `You are a helpful AI assistant for a text formatting tool. Provide concise, practical responses about text processing, formatting, and using the tool's features.`;
      
      const aiResponse = await AIService.callProvider(
        settings,
        chatPrompt,
        userMessage.content,
        'text'
      );

      const aiMessage: ChatMessage = {
        content: aiResponse,
        sender: 'ai',
        timestamp: Date.now()
      };

      setChatHistory(prev => {
        const newHistory = [...prev, aiMessage];
        StorageService.save('ai_formatter_chat_history', newHistory);
        return newHistory;
      });
    } catch (error: any) {
      const errorMessage: ChatMessage = {
        content: `Sorry, I encountered an error: ${error.message}`,
        sender: 'ai',
        timestamp: Date.now(),
        isError: true
      };
      setChatHistory(prev => [...prev, errorMessage]);
    }
  };

  const copyOutput = () => {
    if (!outputText.trim()) {
      showToast('No output to copy', 'warning');
      return;
    }
    navigator.clipboard.writeText(outputText).then(() => {
      showToast('Output copied to clipboard', 'success');
    });
  };

  const applyPrompt = (key: string) => {
    if (promptTemplates[key]) {
      setCustomPrompt(promptTemplates[key]);
      setSelectedPrompt(key);
    }
  };

  const saveSettings = () => {
    StorageService.save('ai_formatter_settings', settings);
    showToast('Settings saved successfully', 'success');
    setShowSettings(false);
  };

  return (
    <div style={{ minHeight: '100vh', padding: '16px', maxWidth: '1600px', margin: '0 auto' }}>
      {/* Toasts */}
      <div style={{ position: 'fixed', top: '20px', right: '20px', zIndex: 3000, display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {toasts.map(toast => (
          <div
            key={toast.id}
            style={{
              background: 'var(--surface)',
              padding: '16px',
              borderRadius: '12px',
              boxShadow: 'var(--shadow-lg)',
              borderLeft: `4px solid var(--${toast.type === 'success' ? 'success' : toast.type === 'error' ? 'error' : toast.type === 'warning' ? 'warning' : 'info'})`,
              minWidth: '300px',
              animation: 'slideIn 0.3s ease'
            }}
          >
            {toast.message}
          </div>
        ))}
      </div>

      {/* Header */}
      <header style={{
        background: 'var(--surface)',
        borderRadius: '12px',
        padding: '24px',
        marginBottom: '16px',
        boxShadow: 'var(--shadow)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '16px'
      }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, margin: 0, marginBottom: '4px' }}>
            🤖 AI Formatter Pro
          </h1>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: 0 }}>
            Smart text processing with OCR and AI formatting
          </p>
        </div>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <button onClick={() => setShowChat(true)} style={headerButtonStyle}>
            <MessageSquare size={18} />
            Chat
          </button>
          <button onClick={() => setShowHelp(true)} style={headerButtonStyle}>
            <HelpCircle size={18} />
            Help
          </button>
          <button onClick={() => setShowSettings(true)} style={headerButtonStyle}>
            <Settings size={18} />
            Settings
          </button>
          <button onClick={() => setShowShortcuts(true)} style={headerButtonStyle}>
            <Keyboard size={18} />
            Shortcuts
          </button>
          <button onClick={() => setShowTemplates(true)} style={headerButtonStyle}>
            <BookOpen size={18} />
            Templates
          </button>
          <button onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')} style={headerButtonStyle}>
            {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '16px' }}>
        {/* Left Panel */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Input */}
          <div style={sectionCardStyle}>
            <div style={sectionHeaderStyle}>
              <FileText size={22} style={{ color: 'var(--brand-primary)' }} />
              <h3>Document Input</h3>
            </div>
            <div 
              style={{ position: 'relative' }}
              onDragEnter={handleDragEnter}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <textarea
                ref={textInputRef}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Paste your text here or drag & drop files (PDF, Images, Text files)..."
                style={{
                  ...textareaStyle,
                  ...(dragOver ? {
                    borderColor: 'var(--brand-primary)',
                    background: 'var(--brand-primary-very-light)',
                    boxShadow: '0 0 0 3px rgba(var(--brand-primary-rgb), 0.1)'
                  } : {})
                }}
                rows={6}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                style={uploadIconBtnStyle}
                title="Upload files (PDF, Images, Text)"
              >
                <Plus size={20} />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                onChange={(e) => handleFileUpload(e.target.files)}
                style={{ display: 'none' }}
                accept=".pdf,.jpg,.jpeg,.png,.tiff,.bmp,.gif,.txt"
              />
            </div>
          </div>

          {/* AI Formatter */}
          <div style={sectionCardStyle}>
            <div style={sectionHeaderStyle}>
              <Settings size={22} style={{ color: 'var(--brand-primary)' }} />
              <h3>AI Formatter</h3>
            </div>
            <select
              value={selectedPrompt}
              onChange={(e) => {
                const value = e.target.value;
                setSelectedPrompt(value);
                if (value && value !== 'custom') {
                  applyPrompt(value);
                }
              }}
              style={selectStyle}
            >
              <option value="">— Choose a task —</option>
              <option value="reflow">Reflow OCR text</option>
              <option value="list-to-csv">Normalize lists to CSV</option>
              <option value="fix-table">Fix table rows</option>
              <option value="clean-email">Clean email text</option>
              <option value="markdown">Convert to Markdown</option>
              <option value="html">Convert to HTML</option>
              <option value="latex">Convert to LaTeX</option>
            </select>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '12px' }}>
              {Object.keys(promptTemplates).slice(0, 4).map(key => (
                <button
                  key={key}
                  onClick={() => applyPrompt(key)}
                  style={{
                    ...chipStyle,
                    ...(selectedPrompt === key ? { background: 'var(--brand-primary)', color: 'white' } : {})
                  }}
                >
                  {key.replace('-', ' ')}
                </button>
              ))}
            </div>
            <textarea
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              placeholder="Describe what you want the AI to do..."
              style={{ ...textareaStyle, marginTop: '16px' }}
              rows={4}
            />
          </div>

          {/* Process Controls */}
          <div style={sectionCardStyle}>
            <div style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '14px', fontWeight: 600 }}>Processing Status</span>
                <span style={statusPillStyle(status.type)}>{status.text}</span>
              </div>
              <div style={{ width: '100%', height: '12px', background: 'var(--bg-tertiary)', borderRadius: '999px' }}>
                <div style={{
                  height: '100%',
                  width: `${progress}%`,
                  background: 'var(--brand-primary)',
                  borderRadius: '999px',
                  transition: 'width 0.3s ease'
                }} />
              </div>
            </div>
            <button
              onClick={processText}
              disabled={processing}
              style={{
                ...primaryButtonStyle,
                width: '100%',
                opacity: processing ? 0.6 : 1,
                cursor: processing ? 'not-allowed' : 'pointer'
              }}
            >
              {processing ? (
                <>
                  <Loader size={20} style={{ animation: 'spin 1s linear infinite' }} />
                  Processing...
                </>
              ) : (
                <>
                  <PlayCircle size={20} />
                  Process with AI
                </>
              )}
            </button>
          </div>

          {/* Documents */}
          <div style={sectionCardStyle}>
            <div style={sectionHeaderStyle}>
              <Folder size={22} style={{ color: 'var(--brand-primary)' }} />
              <h3>Uploaded Documents</h3>
            </div>
            {documents.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
                <Folder size={48} style={{ opacity: 0.5, marginBottom: '8px' }} />
                <div>No documents uploaded yet</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {documents.map(doc => (
                  <div
                    key={doc.id}
                    style={{
                      ...documentCardStyle,
                      ...(currentDoc?.id === doc.id ? { borderColor: 'var(--brand-primary)', background: 'var(--brand-primary-light)' } : {})
                    }}
                    onClick={() => {
                      setCurrentDoc(doc);
                      setInputText(doc.extractedText);
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 500, display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {doc.name}
                        <span style={statusPillStyle(doc.status === 'ready' ? 'ready' : doc.status === 'processing' ? 'processing' : 'error')}>
                          {doc.status}
                        </span>
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        {(doc.size / 1024).toFixed(2)} KB • {doc.extractedText.length} chars
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setDocuments(prev => prev.filter(d => d.id !== doc.id));
                        if (currentDoc?.id === doc.id) {
                          setCurrentDoc(null);
                        }
                      }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: 'var(--text-muted)' }}
                    >
                      <X size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Right Panel - Output */}
        <section style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ ...sectionCardStyle, flex: 1, display: 'flex', flexDirection: 'column' }}>
            <div style={sectionHeaderStyle}>
              <FileText size={22} style={{ color: 'var(--brand-primary)' }} />
              <h3>Formatted Output</h3>
            </div>
            <textarea
              value={outputText}
              onChange={(e) => setOutputText(e.target.value)}
              placeholder="AI-formatted results will appear here..."
              style={{ ...textareaStyle, flex: 1, minHeight: '400px' }}
            />
            <div style={{ display: 'flex', gap: '8px', marginTop: '16px', flexWrap: 'wrap' }}>
              <button onClick={copyOutput} style={primaryButtonStyle}>
                <Copy size={16} /> Copy Output
              </button>
              <button onClick={() => setOutputText('')} style={secondaryButtonStyle}>
                <Trash2 size={16} /> Clear
              </button>
              <button
                onClick={() => {
                  setInputText(outputText);
                  setOutputText('');
                }}
                style={secondaryButtonStyle}
              >
                <RefreshCw size={16} /> Reprocess
              </button>
            </div>
          </div>
        </section>
      </main>

      {/* Modals */}
      {showChat && (
        <Modal onClose={() => setShowChat(false)} title="💬 Chat with AI">
          <div style={{ display: 'flex', flexDirection: 'column', height: '70vh' }}>
            <div ref={chatMessagesRef} style={chatContainerStyle}>
              {chatHistory.map((msg, idx) => (
                <div key={idx} style={chatMessageStyle(msg.sender)}>
                  <div>{msg.sender === 'ai' && <strong>AI: </strong>}{msg.content}</div>
                  <div style={{ fontSize: '11px', opacity: 0.7, marginTop: '4px' }}>
                    {new Date(msg.timestamp).toLocaleTimeString()}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <textarea
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendChatMessage();
                  }
                }}
                placeholder="Type your message..."
                style={{ ...textareaStyle, flex: 1, minHeight: '60px' }}
              />
              <button onClick={sendChatMessage} style={{ ...primaryButtonStyle, minHeight: '60px' }}>
                <Send size={20} />
              </button>
            </div>
          </div>
        </Modal>
      )}

      {showSettings && (
        <Modal onClose={() => setShowSettings(false)} title="⚙️ AI Settings">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={labelStyle}>AI Provider</label>
              <select
                value={settings.provider}
                onChange={(e) => setSettings({ ...settings, provider: e.target.value })}
                style={selectStyle}
              >
                <option value="">— Select Provider —</option>
                <option value="local">Local only (no API)</option>
                <option value="groq">Groq</option>
                <option value="deepseek">DeepSeek (Hugging Face)</option>
                <option value="openai">OpenAI</option>
              </select>
            </div>
            {settings.provider && settings.provider !== 'local' && (
              <>
                <div>
                  <label style={labelStyle}>API Key</label>
                  <input
                    type="password"
                    value={settings.apiKey}
                    onChange={(e) => setSettings({ ...settings, apiKey: e.target.value })}
                    placeholder="Enter your API key"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Model (optional)</label>
                  <input
                    type="text"
                    value={settings.model}
                    onChange={(e) => setSettings({ ...settings, model: e.target.value })}
                    placeholder="Leave blank for default"
                    style={inputStyle}
                  />
                </div>
              </>
            )}
            <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
              <button onClick={() => setSettings({ provider: '', apiKey: '', model: '', customUrl: '', customHeader: 'Authorization', saveKey: false })} style={{ ...secondaryButtonStyle, flex: 1 }}>
                Clear Settings
              </button>
              <button onClick={saveSettings} style={{ ...primaryButtonStyle, flex: 1 }}>
                Save Settings
              </button>
            </div>
          </div>
        </Modal>
      )}

      {showHelp && (
        <Modal onClose={() => setShowHelp(false)} title="🤖 Help Guide">
          <div style={{ maxHeight: '70vh', overflowY: 'auto' }}>
            <HelpStep number={1} title="What is AI Formatter?">
              <p>AI Formatter uses artificial intelligence to automatically clean and format your text. It can:</p>
              <ul>
                <li>Fix messy OCR text from scanned documents</li>
                <li>Remove extra spaces and broken line breaks</li>
                <li>Reformat lists and tables automatically</li>
                <li>Convert between formats like Markdown, HTML, and LaTeX</li>
              </ul>
            </HelpStep>
            <HelpStep number={2} title="Get Your API Key">
              <p>Visit providers like Hugging Face, Groq, or OpenAI to get a free API key:</p>
              <ul>
                <li><strong>Hugging Face:</strong> huggingface.co/settings/tokens</li>
                <li><strong>Groq:</strong> console.groq.com</li>
                <li><strong>OpenAI:</strong> platform.openai.com/api-keys</li>
              </ul>
            </HelpStep>
            <HelpStep number={3} title="How to Use">
              <ol>
                <li>Upload a file (PDF, image, text) or paste text directly</li>
                <li>Choose a formatting task from the AI Formatter section</li>
                <li>Click "Process with AI"</li>
                <li>Copy your formatted results</li>
              </ol>
            </HelpStep>
          </div>
        </Modal>
      )}

      {showShortcuts && (
        <Modal onClose={() => setShowShortcuts(false)} title="⌨️ Keyboard Shortcuts">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '12px' }}>
            <ShortcutItem label="Process text" keys={['Ctrl', 'Enter']} />
            <ShortcutItem label="Open Chat" keys={['Ctrl', '/']} />
            <ShortcutItem label="Copy output" keys={['Ctrl', 'Shift', 'C']} />
            <ShortcutItem label="Close modals" keys={['Esc']} />
          </div>
        </Modal>
      )}

      {showTemplates && (
        <Modal onClose={() => setShowTemplates(false)} title="📚 Template Library">
          <div style={{ display: 'grid', gap: '12px' }}>
            {templates.map(template => (
              <div
                key={template.id}
                onClick={() => {
                  setCustomPrompt(template.prompt);
                  setShowTemplates(false);
                  showToast(`Applied template: ${template.name}`, 'success');
                }}
                style={templateCardStyle}
              >
                <h4 style={{ margin: '0 0 8px 0' }}>{template.name}</h4>
                <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)' }}>
                  {template.description}
                </p>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
};

// Helper Components
const Modal: React.FC<{ children: React.ReactNode; onClose: () => void; title: string }> = ({ children, onClose, title }) => (
  <div style={modalOverlayStyle} onClick={(e) => e.target === e.currentTarget && onClose()}>
    <div style={modalContentStyle} onClick={(e) => e.stopPropagation()}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px' }}>
        <h3 style={{ fontSize: '20px', fontWeight: 700, margin: 0 }}>{title}</h3>
        <button onClick={onClose} style={modalCloseStyle}>×</button>
      </div>
      {children}
    </div>
  </div>
);

const HelpStep: React.FC<{ number: number; title: string; children: React.ReactNode }> = ({ number, title, children }) => (
  <div style={{
    marginBottom: '24px',
    padding: '16px',
    background: 'var(--bg-secondary)',
    borderLeft: '4px solid var(--brand-primary)',
    borderRadius: '8px'
  }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
      <div style={{
        background: 'var(--brand-primary)',
        color: 'white',
        width: '32px',
        height: '32px',
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 700
      }}>
        {number}
      </div>
      <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>{title}</h4>
    </div>
    <div style={{ marginLeft: '44px', fontSize: '14px', lineHeight: 1.6 }}>
      {children}
    </div>
  </div>
);

const ShortcutItem: React.FC<{ label: string; keys: string[] }> = ({ label, keys }) => (
  <div style={{
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px',
    background: 'var(--bg-secondary)',
    borderRadius: '8px'
  }}>
    <span>{label}</span>
    <div style={{ display: 'flex', gap: '4px' }}>
      {keys.map((key, idx) => (
        <kbd key={idx} style={{
          padding: '2px 6px',
          background: 'var(--bg-tertiary)',
          border: '1px solid var(--border-light)',
          borderRadius: '4px',
          fontSize: '11px',
          fontFamily: 'monospace'
        }}>
          {key}
        </kbd>
      ))}
    </div>
  </div>
);

// Styles
const headerButtonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  padding: '8px 14px',
  border: '1px solid var(--border-light)',
  borderRadius: '8px',
  background: 'var(--bg-tertiary)',
  color: 'var(--text-primary)',
  fontSize: '13px',
  fontWeight: 500,
  cursor: 'pointer',
  transition: 'all 0.15s',
  minHeight: '36px'
};

const sectionCardStyle: React.CSSProperties = {
  background: 'var(--surface)',
  borderRadius: '12px',
  padding: '24px',
  boxShadow: 'var(--shadow)',
  border: '1px solid var(--border-light)'
};

const sectionHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  marginBottom: '16px',
  paddingBottom: '12px',
  borderBottom: '1px solid var(--border-light)'
};

const textareaStyle: React.CSSProperties = {
  width: '100%',
  padding: '12px',
  border: '1px solid var(--border-light)',
  borderRadius: '8px',
  background: 'var(--bg-primary)',
  color: 'var(--text-primary)',
  fontSize: '14px',
  fontFamily: 'inherit',
  lineHeight: 1.6,
  resize: 'vertical' as const,
  transition: 'all 0.15s'
};

const selectStyle: React.CSSProperties = {
  width: '100%',
  padding: '12px',
  border: '1px solid var(--border-light)',
  borderRadius: '8px',
  background: 'var(--bg-primary)',
  color: 'var(--text-primary)',
  fontSize: '14px',
  fontFamily: 'inherit',
  minHeight: '44px',
  cursor: 'pointer'
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '12px',
  border: '1px solid var(--border-light)',
  borderRadius: '8px',
  background: 'var(--bg-primary)',
  color: 'var(--text-primary)',
  fontSize: '14px',
  fontFamily: 'inherit',
  minHeight: '44px'
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '13px',
  fontWeight: 600,
  color: 'var(--text-secondary)',
  marginBottom: '8px'
};

const chipStyle: React.CSSProperties = {
  padding: '6px 12px',
  background: 'var(--bg-tertiary)',
  border: '1px solid var(--border-light)',
  borderRadius: '8px',
  fontSize: '13px',
  cursor: 'pointer',
  transition: 'all 0.15s'
};

const primaryButtonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '8px',
  padding: '10px 16px',
  borderRadius: '8px',
  fontSize: '14px',
  fontWeight: 500,
  cursor: 'pointer',
  border: 'none',
  background: 'var(--brand-primary)',
  color: 'white',
  boxShadow: 'var(--shadow)',
  transition: 'all 0.15s',
  minHeight: '44px',
  justifyContent: 'center'
};

const secondaryButtonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '8px',
  padding: '10px 16px',
  borderRadius: '8px',
  fontSize: '14px',
  fontWeight: 500,
  cursor: 'pointer',
  background: 'var(--bg-tertiary)',
  color: 'var(--text-primary)',
  border: '1px solid var(--border-light)',
  transition: 'all 0.15s',
  minHeight: '44px',
  justifyContent: 'center'
};

const uploadIconBtnStyle: React.CSSProperties = {
  position: 'absolute',
  bottom: '8px',
  right: '8px',
  width: '36px',
  height: '36px',
  border: '1px solid var(--border-light)',
  borderRadius: '8px',
  background: 'var(--bg-tertiary)',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  transition: 'all 0.15s'
};

const statusPillStyle = (type: string): React.CSSProperties => ({
  padding: '4px 10px',
  borderRadius: '999px',
  fontSize: '12px',
  fontWeight: 500,
  border: '1px solid transparent',
  background: type === 'ready' ? 'var(--success-bg)' : type === 'processing' ? 'var(--warning-bg)' : 'var(--error-bg)',
  color: type === 'ready' ? 'var(--success)' : type === 'processing' ? 'var(--warning)' : 'var(--error)',
  borderColor: type === 'ready' ? 'var(--success)' : type === 'processing' ? 'var(--warning)' : 'var(--error)'
});

const documentCardStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '12px',
  background: 'var(--bg-secondary)',
  border: '1px solid var(--border-light)',
  borderRadius: '8px',
  cursor: 'pointer',
  transition: 'all 0.15s',
  minHeight: '60px'
};

const modalOverlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0, 0, 0, 0.5)',
  backdropFilter: 'blur(4px)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '16px',
  zIndex: 2000,
  animation: 'modalFadeIn 0.3s ease'
};

const modalContentStyle: React.CSSProperties = {
  background: 'var(--surface)',
  borderRadius: '16px',
  padding: '32px',
  maxWidth: '600px',
  width: '100%',
  maxHeight: '90vh',
  overflowY: 'auto',
  boxShadow: 'var(--shadow-xl)',
  animation: 'modalSlideIn 0.3s ease'
};

const modalCloseStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  fontSize: '28px',
  color: 'var(--text-muted)',
  cursor: 'pointer',
  padding: 0,
  width: '32px',
  height: '32px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: '6px',
  transition: 'all 0.15s'
};

const chatContainerStyle: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  padding: '16px',
  background: 'var(--bg-secondary)',
  borderRadius: '8px',
  marginBottom: '16px',
  display: 'flex',
  flexDirection: 'column',
  gap: '12px'
};

const chatMessageStyle = (sender: string): React.CSSProperties => ({
  alignSelf: sender === 'user' ? 'flex-end' : 'flex-start',
  maxWidth: '85%',
  padding: '12px',
  borderRadius: '12px',
  background: sender === 'user' ? 'var(--brand-primary)' : 'var(--surface)',
  color: sender === 'user' ? 'white' : 'var(--text-primary)',
  border: sender === 'ai' ? '1px solid var(--border-light)' : 'none'
});

const templateCardStyle: React.CSSProperties = {
  padding: '16px',
  background: 'var(--bg-secondary)',
  border: '1px solid var(--border-light)',
  borderRadius: '8px',
  cursor: 'pointer',
  transition: 'all 0.2s'
};

export default AIFormatterPro;