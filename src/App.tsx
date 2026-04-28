import React, { useState, useRef, useEffect } from 'react';
import { Settings, Download, PlayCircle, Loader2, ArrowRightLeft, FileText, Trash2, Edit3, CheckCircle2, FileSearch, Sparkles } from 'lucide-react';
import { FileUpload } from './components/FileUpload';
import { SrtTranslator, Subtitle, TranslationStatus, TranslationEvaluation } from './lib/translator';
import Parser from 'srt-parser-2';

const parser = new Parser();

interface FileTask {
  id: string;
  file: File;
  originalSrt: string;
  subtitles: Subtitle[];
  translatedSubtitles: Subtitle[];
  status: TranslationStatus;
  progress: { current: number; total: number };
  error?: string;
}

export default function App() {
  const [tasks, setTasks] = useState<FileTask[]>([]);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  
  // Settings
  const [targetLang, setTargetLang] = useState('Vietnamese');
  const [model, setModel] = useState<'gemini-2.5-flash' | 'gemini-2.5-pro' | 'gemini-3.1-pro-preview' | 'gemini-3-flash-preview'>('gemini-2.5-pro');
  const [movieContext, setMovieContext] = useState('');
  const [tone, setTone] = useState('Bình thường / Tự nhiên');

  const [isSummarizing, setIsSummarizing] = useState(false);
  const [summary, setSummary] = useState('');
  
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [evaluation, setEvaluation] = useState<TranslationEvaluation | null>(null);

  const handleFilesSelect = async (selectedFiles: File[]) => {
    const newTasks: FileTask[] = [];
    for (const f of selectedFiles) {
      const text = await f.text();
      const parsed = parser.fromSrt(text);
      newTasks.push({
        id: Math.random().toString(36).substring(7),
        file: f,
        originalSrt: text,
        subtitles: parsed,
        translatedSubtitles: [],
        status: 'idle',
        progress: { current: 0, total: parsed.length }
      });
    }
    setTasks(prev => {
      const updated = [...prev, ...newTasks];
      if (!activeTaskId && updated.length > 0) {
        setActiveTaskId(updated[0].id);
      }
      return updated;
    });
  };

  const updateTask = (id: string, updates: Partial<FileTask>) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
  };

  const handleRemoveTask = (id: string) => {
    setTasks(prev => {
      const filtered = prev.filter(t => t.id !== id);
      if (activeTaskId === id) {
        setActiveTaskId(filtered.length > 0 ? filtered[0].id : null);
      }
      return filtered;
    });
  };

  const handleTranslate = async (taskId: string) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task || !task.originalSrt || task.subtitles.length === 0) return;
    
    updateTask(taskId, { status: 'translating', error: undefined });
    
    try {
      const translator = new SrtTranslator();
      const results = await translator.translate(task.originalSrt, {
        apiKey: process.env.GEMINI_API_KEY || '',
        targetLanguage: targetLang,
        model: model,
        batchSize: 40,
        contextWindow: 30,
        movieContext: movieContext,
        tone: tone,
        onProgress: (current, total, updatedTranslated) => {
          updateTask(taskId, {
            progress: { current, total },
            translatedSubtitles: [...updatedTranslated]
          });
        }
      });
      
      updateTask(taskId, {
        translatedSubtitles: results,
        status: 'done'
      });
    } catch (err: any) {
      console.error(err);
      updateTask(taskId, {
        status: 'error',
        error: err.message || String(err)
      });
      alert(`Translation failed for ${task.file.name}: ${err.message || String(err)}`);
    }
  };

  const handleTranslateAll = async () => {
    const idleTasks = tasks.filter(t => t.status === 'idle' || t.status === 'error');
    for (const task of idleTasks) {
      await handleTranslate(task.id);
    }
  };

  const handleDownload = (taskId: string) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task || task.translatedSubtitles.length === 0) return;
    
    const finalSrt = parser.toSrt(task.translatedSubtitles);
    const blob = new Blob([finalSrt], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `translated_${task.file.name}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleRewrite = async (taskId: string, index: number) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    const sub = task.subtitles[index];
    const trans = task.translatedSubtitles[index];
    if (!trans || !trans.text) return;

    const translator = new SrtTranslator();
    try {
      const newText = await translator.rewriteSubtitle(
        sub.text,
        trans.text,
        targetLang,
        movieContext,
        tone,
        model
      );
      if (newText) {
        const newTranslated = [...task.translatedSubtitles];
        newTranslated[index] = { ...newTranslated[index], text: newText };
        updateTask(taskId, { translatedSubtitles: newTranslated });
      }
    } catch (error: any) {
      alert("Rewrite failed: " + (error.message || String(error)));
    }
  };

  const handleSummarize = async () => {
    if (!activeTask || activeTask.subtitles.length === 0) return;
    setIsSummarizing(true);
    setSummary('');
    try {
      const translator = new SrtTranslator();
      const s = await translator.summarizeSubtitles(activeTask.subtitles, movieContext, model);
      setSummary(s);
    } catch (e: any) {
      alert("Failed to summarize: " + (e.message || String(e)));
    } finally {
      setIsSummarizing(false);
    }
  };

  const handleEvaluate = async () => {
    if (!activeTask || activeTask.translatedSubtitles.length === 0 || activeTask.status !== 'done') return;
    setIsEvaluating(true);
    setEvaluation(null);
    try {
      const translator = new SrtTranslator();
      const ev = await translator.evaluateTranslation(activeTask.subtitles, activeTask.translatedSubtitles, targetLang, movieContext, model);
      setEvaluation(ev);
    } catch (e: any) {
      alert("Failed to evaluate: " + (e.message || String(e)));
    } finally {
      setIsEvaluating(false);
    }
  };

  const activeTask = tasks.find(t => t.id === activeTaskId);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 p-4 md:p-8 font-sans">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Header & Settings */}
        <header className="flex flex-col gap-6 p-6 bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
            <div className="space-y-2">
              <h1 className="text-3xl font-bold tracking-tight">Context-Aware SRT Translator</h1>
              <p className="text-zinc-500 dark:text-zinc-400 max-w-xl">
                Upload SRT files and translate them naturally using Google's Gemini AI. 
                Configure context and tone for seamless translations.
              </p>
            </div>
            
            <div className="flex flex-col gap-3 min-w-[300px]">
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Language</label>
                  <select 
                    value={targetLang}
                    onChange={(e) => setTargetLang(e.target.value)}
                    className="bg-zinc-100 dark:bg-zinc-800 border-transparent rounded-lg text-sm px-3 py-2 w-full focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    <option value="Vietnamese">Vietnamese</option>
                    <option value="English">English</option>
                    <option value="Spanish">Spanish</option>
                  </select>
                </div>
                
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold uppercase tracking-wider text-zinc-500">AI Model</label>
                  <select 
                    value={model}
                    onChange={(e) => setModel(e.target.value as any)}
                    className="bg-zinc-100 dark:bg-zinc-800 border-transparent rounded-lg text-sm px-3 py-2 w-full focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    <option value="gemini-2.5-pro">Gemini 2.5 Pro (Best)</option>
                    <option value="gemini-2.5-flash">Gemini 2.5 Flash (Fast)</option>
                    <option value="gemini-3.1-pro-preview">Gemini 3.1 Pro</option>
                  </select>
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Tone / Xưng hô</label>
                <select 
                  value={tone}
                  onChange={(e) => setTone(e.target.value)}
                  className="bg-zinc-100 dark:bg-zinc-800 border-transparent rounded-lg text-sm px-3 py-2 w-full focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  <option value="Bình thường / Tự nhiên (tôi, bạn, anh, em...)">Bình thường / Tự nhiên</option>
                  <option value="Giang hồ / Cười đùa (mày, tao, ổng, bả...)">Giang hồ / Thô lỗ / Hài hước</option>
                  <option value="Nghiêm túc / Khoa học / Tài liệu">Nghiêm túc / Tài liệu</option>
                  <option value="Cổ trang / Kiếm hiệp (tại hạ, các hạ...)">Cổ trang / Kiếm hiệp</option>
                </select>
              </div>
            </div>
          </div>
          
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Global Context / Tóm tắt nội dung (Optional)</label>
            <textarea
              className="bg-zinc-100 dark:bg-zinc-800 border-transparent rounded-lg text-sm px-4 py-3 w-full focus:ring-2 focus:ring-blue-500 outline-none resize-none"
              rows={2}
              placeholder="E.g: Phim về 2 người bạn đường phố cãi nhau giành miếng ăn..."
              value={movieContext}
              onChange={(e) => setMovieContext(e.target.value)}
            ></textarea>
          </div>
        </header>

        {/* Workspace */}
        {tasks.length === 0 ? (
          <FileUpload onFilesSelect={handleFilesSelect} multiple={true} />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            
            {/* Sidebar List */}
            <div className="lg:col-span-1 space-y-4">
              <div className="flex justify-between items-center px-1">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">Files ({tasks.length})</h2>
                <label className="text-xs font-medium text-blue-600 hover:underline cursor-pointer">
                  + Add More
                  <input type="file" accept=".srt" multiple className="hidden" onChange={(e) => e.target.files && handleFilesSelect(Array.from(e.target.files))} />
                </label>
              </div>
              <div className="space-y-2">
                {tasks.map(t => (
                  <div 
                    key={t.id} 
                    onClick={() => setActiveTaskId(t.id)}
                    className={`p-3 rounded-xl border cursor-pointer transition-colors relative group ${
                      activeTaskId === t.id 
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' 
                        : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-zinc-300 dark:hover:border-zinc-700'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="truncate">
                        <p className="font-medium text-sm truncate" title={t.file.name}>{t.file.name}</p>
                        <p className="text-xs text-zinc-500 mt-0.5">
                          {t.status === 'done' ? 'Completed' : t.status === 'translating' ? `${Math.round((t.progress.current / t.progress.total) * 100)}%` : t.status === 'error' ? 'Error' : 'Pending'}
                        </p>
                      </div>
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleRemoveTask(t.id); }}
                        className="text-zinc-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Remove file"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              
              <button 
                onClick={handleTranslateAll}
                className="w-full py-2.5 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-xl text-sm font-medium hover:opacity-90 transition-opacity"
              >
                Translate All Pending
              </button>
            </div>

            {/* Main Editor */}
            <div className="lg:col-span-3">
              {activeTask ? (
                <div className="border border-zinc-200 dark:border-zinc-800 rounded-2xl bg-white dark:bg-zinc-900 shadow-sm overflow-hidden flex flex-col h-[750px]">
                  
                  {/* Action Bar */}
                  <div className="flex flex-wrap items-center justify-between gap-4 p-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 rounded-lg">
                        <FileText className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-sm">{activeTask.file.name}</h3>
                        <p className="text-xs text-zinc-500">{activeTask.subtitles.length} lines total</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3">
                      {activeTask.status === 'idle' || activeTask.status === 'error' ? (
                        <button
                          onClick={() => handleTranslate(activeTask.id)}
                          className="flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-sm"
                        >
                          <ArrowRightLeft className="w-4 h-4" />
                          Start Translation
                        </button>
                      ) : activeTask.status === 'translating' ? (
                        <div className="flex items-center gap-4 px-4">
                          <div className="w-32 h-2 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-blue-600 transition-all duration-300 ease-out" 
                              style={{ width: `${(activeTask.progress.current / activeTask.progress.total) * 100}%` }}
                            />
                          </div>
                          <button disabled className="flex items-center gap-2 text-sm font-medium text-blue-600 cursor-not-allowed">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            {Math.round((activeTask.progress.current / activeTask.progress.total) * 100)}%
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => handleDownload(activeTask.id)}
                          className="flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors shadow-sm"
                        >
                          <Download className="w-4 h-4" />
                          Download SRT
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="flex bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 p-2 gap-2 overflow-x-auto">
                    <button
                      onClick={handleSummarize}
                      disabled={isSummarizing || activeTask.subtitles.length === 0}
                      className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 rounded transition-colors disabled:opacity-50 whitespace-nowrap"
                    >
                      {isSummarizing ? <Loader2 className="w-3.5 h-3.5 animate-spin"/> : <FileSearch className="w-3.5 h-3.5" />}
                      Tóm tắt bộ phim từ Sub gốc
                    </button>
                    {(activeTask.status === 'done' || activeTask.translatedSubtitles.length > 0) && (
                      <button
                        onClick={handleEvaluate}
                        disabled={isEvaluating}
                        className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium bg-purple-50 text-purple-600 hover:bg-purple-100 dark:bg-purple-900/20 dark:text-purple-400 dark:hover:bg-purple-900/40 rounded transition-colors disabled:opacity-50 whitespace-nowrap"
                      >
                        {isEvaluating ? <Loader2 className="w-3.5 h-3.5 animate-spin"/> : <Sparkles className="w-3.5 h-3.5" />}
                        Đánh giá bản dịch ({targetLang})
                      </button>
                    )}
                  </div>

                  {summary && (
                    <div className="p-4 bg-blue-50 dark:bg-blue-900/10 border-b border-blue-100 dark:border-blue-900/30 text-sm">
                      <h4 className="font-semibold text-blue-800 dark:text-blue-300 mb-1 flex items-center gap-2">
                        <FileSearch className="w-4 h-4" /> Tóm tắt nội dung
                      </h4>
                      <p className="text-blue-900 dark:text-blue-200 whitespace-pre-line">{summary}</p>
                    </div>
                  )}

                  {evaluation && (
                    <div className="p-4 bg-purple-50 dark:bg-purple-900/10 border-b border-purple-100 dark:border-purple-900/30 text-sm overflow-y-auto max-h-64">
                      <div className="flex items-center gap-2 mb-2">
                        <h4 className="font-semibold text-purple-800 dark:text-purple-300 flex items-center gap-2">
                          <Sparkles className="w-4 h-4" /> Đánh giá bản dịch
                        </h4>
                        <span className="px-2 py-0.5 bg-purple-200 dark:bg-purple-800 text-purple-800 dark:text-purple-200 rounded-full font-bold text-xs">
                          {evaluation.score}/10
                        </span>
                      </div>
                      <p className="text-purple-900 dark:text-purple-200 mb-3">{evaluation.comments}</p>
                      
                      {evaluation.suggestions && evaluation.suggestions.length > 0 && (
                        <div className="space-y-2">
                          <h5 className="font-semibold text-purple-800 dark:text-purple-300 text-xs uppercase tracking-wider">Góp ý sửa đổi</h5>
                          {evaluation.suggestions.map((s, i) => (
                            <div key={i} className="bg-white/50 dark:bg-zinc-950/50 p-2 rounded border border-purple-100 dark:border-purple-900/30 text-xs">
                              <p className="font-mono text-zinc-500 mb-1">{s.original}</p>
                              <div className="flex items-center gap-2 mb-1">
                                <span className="line-through text-red-500">{s.current}</span>
                                <ArrowRightLeft className="w-3 h-3 text-zinc-400" />
                                <span className="text-green-600 dark:text-green-400 font-medium">{s.suggestion}</span>
                              </div>
                              <p className="text-purple-600 dark:text-purple-400 italic">Lý do: {s.reason}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Subtitle Viewer list */}
                  <div className="flex-1 overflow-y-auto p-4 space-y-2">
                    {activeTask.subtitles.slice(0, Math.max(activeTask.progress.current + 20, 200)).map((sub, index) => {
                      const translated = activeTask.translatedSubtitles[index];
                      const isDone = translated && translated.text && activeTask.status !== 'idle';
                      const isCurrent = activeTask.status === 'translating' && index >= activeTask.progress.current - 40 && index < activeTask.progress.current;
                      
                      return (
                        <div 
                          key={sub.id} 
                          className={`grid grid-cols-[100px_1fr_1fr_40px] md:grid-cols-[140px_1fr_1fr_40px] gap-4 p-3 rounded-xl text-sm border transition-colors group ${
                            isCurrent 
                              ? 'border-blue-200 bg-blue-50 dark:border-blue-900/50 dark:bg-blue-900/20' 
                              : isDone 
                                ? 'border-green-100 bg-green-50/50 dark:border-green-900/30 dark:bg-green-950/10'
                                : 'border-zinc-100 bg-zinc-50/30 dark:border-zinc-800/50 dark:bg-zinc-900/30'
                          }`}
                        >
                          <div className="text-xs text-zinc-400 font-mono flex flex-col justify-center">
                            <div>{sub.startTime.split(',')[0]}</div>
                            <div className="text-[10px] text-zinc-300 dark:text-zinc-600">to</div>
                            <div>{sub.endTime.split(',')[0]}</div>
                          </div>
                          
                          <div className="text-zinc-600 dark:text-zinc-300 leading-relaxed whitespace-pre-line py-1">
                            {sub.text}
                          </div>
                          
                          <div className={`leading-relaxed whitespace-pre-line font-medium py-1 ${isDone ? 'text-zinc-900 dark:text-zinc-100' : 'text-zinc-400 dark:text-zinc-600 italic'}`}>
                            {isDone ? translated.text : (activeTask.status === 'translating' && index < activeTask.progress.current + 40 ? 'Translating...' : 'Pending')}
                          </div>

                          <div className="flex flex-col justify-center items-center opacity-0 group-hover:opacity-100 transition-opacity">
                            {isDone && (
                              <button 
                                onClick={() => handleRewrite(activeTask.id, index)}
                                className="p-2 text-blue-600 hover:bg-blue-100 dark:hover:bg-blue-900/50 rounded-lg transition-colors"
                                title="Rewrite to sound more natural"
                              >
                                <Edit3 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    {activeTask.subtitles.length > Math.max(activeTask.progress.current + 20, 200) && (
                      <div className="p-4 text-center text-sm text-zinc-500 italic border border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl">
                        +{activeTask.subtitles.length - Math.max(activeTask.progress.current + 20, 200)} more lines... (List truncated for rendering performance)
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="h-full flex items-center justify-center border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl bg-zinc-50 dark:bg-zinc-900/50">
                  <p className="text-zinc-500">Select a file from the sidebar to view details</p>
                </div>
              )}
            </div>
            
          </div>
        )}
      </div>
    </div>
  );
}

