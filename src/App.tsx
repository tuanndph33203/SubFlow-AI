import React, { useState, useEffect } from 'react';
import { Settings, Download, PlayCircle, Loader2, ArrowRightLeft, FileText, Trash2, Edit3, CheckCircle2, Film, Subtitles, Save, Upload, Scissors, ZoomIn, ZoomOut, Volume2 } from 'lucide-react';
import { FileUpload } from './components/FileUpload';
import { SrtTranslator, Subtitle, TranslationStatus } from './lib/translator';
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
  const [activeTab, setActiveTab] = useState<'subtitles' | 'settings'>('subtitles');
  
  // Tasks state
  const [tasks, setTasks] = useState<FileTask[]>([]);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  
  // Settings & DB saving
  const [projectId, setProjectId] = useState<string | null>(null);
  const [targetLang, setTargetLang] = useState('Vietnamese');
  const [model, setModel] = useState<'gemini-2.5-flash' | 'gemini-2.5-pro' | 'gemini-3.1-pro-preview' | 'gemini-3-flash-preview'>('gemini-2.5-pro');
  const [movieContext, setMovieContext] = useState('');
  const [tone, setTone] = useState('Bình thường / Tự nhiên');
  const [projectName, setProjectName] = useState('My Video Project');
  const [projectsList, setProjectsList] = useState<any[]>([]);

  // Load projects from MongoDB on start
  useEffect(() => {
    fetch('/api/projects')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setProjectsList(data);
          if (data.length > 0) {
              loadProjectConfig(data[0]);
          }
        }
      })
      .catch(err => console.error("Could not fetch projects:", err));
  }, []);

  const loadProjectConfig = (p: any) => {
      setProjectId(p._id);
      setProjectName(p.name);
      setTargetLang(p.targetLang);
      setModel(p.model);
      setTone(p.tone);
      setMovieContext(p.movieContext || '');
  }

  const saveProjectConfig = async () => {
    const payload = {
        name: projectName,
        targetLang,
        model,
        tone,
        movieContext
    };

    try {
        let res;
        if (projectId) {
            res = await fetch(`/api/projects/${projectId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        } else {
            res = await fetch(`/api/projects`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        }
        
        if (res.ok) {
            const saved = await res.json();
            if (saved._id) setProjectId(saved._id);
            alert("Đã lưu cấu hình dự án!");
            
            // Refresh list
            const refresh = await fetch('/api/projects');
            setProjectsList(await refresh.json());
        } else {
            alert("Lưu thất bại: " + (await res.text()));
        }
    } catch (err: any) {
        alert("Lỗi khi kết nối DB: " + err.message);
    }
  };

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
      updateTask(taskId, { translatedSubtitles: results, status: 'done' });
    } catch (err: any) {
      updateTask(taskId, { status: 'error', error: err.message || String(err) });
      alert(`Translation failed: ${err.message || String(err)}`);
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

  const activeTask = tasks.find(t => t.id === activeTaskId);

  return (
    <div className="flex h-screen bg-zinc-50 dark:bg-zinc-950 font-sans text-zinc-900 dark:text-zinc-100">
      
      {/* Sidebar Navigation */}
      <nav className="w-20 lg:w-64 border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex flex-col items-center lg:items-start overflow-hidden">
        <div className="flex items-center gap-3 w-full p-4 lg:p-6 border-b border-zinc-200 dark:border-zinc-800">
          <div className="p-2 bg-blue-600 text-white rounded-xl">
            <Film className="w-5 h-5" />
          </div>
          <span className="hidden lg:block font-bold text-lg">Video Studio</span>
        </div>

        <div className="w-full flex-1 py-6 px-3 flex flex-col gap-2 overflow-y-auto">
          <div className="px-3 text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2 hidden lg:block">Projects</div>
          
          <div className="flex flex-col gap-1">
              {projectsList.map(p => (
                  <button 
                      key={p._id}
                      onClick={() => {
                          loadProjectConfig(p);
                          setTasks([]);
                          setActiveTaskId(null);
                          setActiveTab('subtitles');
                      }}
                      className={`w-full flex items-center lg:justify-start justify-center gap-3 p-2 rounded-xl transition-colors text-sm ${
                          projectId === p._id ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 font-medium' : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-100'
                      }`}
                  >
                      <div className={`w-5 h-5 flex-shrink-0 flex items-center justify-center rounded ${projectId === p._id ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400' : 'bg-zinc-100 dark:bg-zinc-800'}`}>
                          <span className="text-[10px] uppercase font-bold">{p.name ? p.name.charAt(0) : 'P'}</span>
                      </div>
                      <span className="hidden lg:block truncate text-left flex-1" title={p.name}>{p.name || 'Untitled'}</span>
                  </button>
              ))}
              
              <button 
                  onClick={() => {
                      setProjectId(null);
                      setProjectName('New Project');
                      setTargetLang('Vietnamese');
                      setModel('gemini-2.5-pro');
                      setTone('Bình thường / Tự nhiên');
                      setMovieContext('');
                      setTasks([]);
                      setActiveTaskId(null);
                      setActiveTab('settings');
                  }} 
                  className="w-full flex items-center lg:justify-start justify-center gap-3 p-2 mt-2 rounded-xl transition-colors text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 border border-dashed border-blue-200 dark:border-blue-800/50"
              >
                  <div className="w-5 h-5 flex-shrink-0 flex items-center justify-center">
                      <span className="text-lg leading-none">+</span>
                  </div>
                  <span className="hidden lg:block text-left flex-1 font-medium">New Project</span>
              </button>
          </div>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-screen overflow-auto">
        <header className="px-8 py-5 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex items-center justify-between">
           <div className="flex items-center gap-6">
               <div>
                   <h1 className="text-xl font-bold truncate max-w-[200px]" title={projectName}>{projectName || 'Select a Project'}</h1>
               </div>
               
               {projectId || projectName === 'New Project' ? (
               <div className="flex bg-zinc-100 dark:bg-zinc-800 p-1 rounded-lg">
                   <button 
                       onClick={() => setActiveTab('subtitles')}
                       className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${activeTab === 'subtitles' ? 'bg-white shadow-sm dark:bg-zinc-700 dark:text-white' : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200'}`}
                   >SRT Translator</button>
                   <button 
                       onClick={() => setActiveTab('settings')}
                       className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${activeTab === 'settings' ? 'bg-white shadow-sm dark:bg-zinc-700 dark:text-white' : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200'}`}
                   >Settings</button>
               </div>
               ) : null}
           </div>
           
           <button onClick={saveProjectConfig} className="flex items-center gap-2 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity">
              <Save className="w-4 h-4" />
              Lưu / Cập nhật Dự án
           </button>
        </header>

        <div className="p-8 flex-1">
            {activeTab === 'settings' && (
                <div className="max-w-2xl mx-auto space-y-6 bg-white dark:bg-zinc-900 p-8 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
                    <h2 className="text-2xl font-bold mb-4">Cài đặt Dự án (MongoDB Sync)</h2>
                    
                    <div className="flex flex-col gap-1">
                        <label className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Tên Dự án</label>
                        <input 
                            value={projectName}
                            onChange={e => setProjectName(e.target.value)}
                            className="bg-zinc-100 dark:bg-zinc-800 border-transparent rounded-lg text-sm px-4 py-3 w-full focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="flex flex-col gap-1">
                            <label className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Ngôn ngữ đích</label>
                            <select 
                                value={targetLang}
                                onChange={(e) => setTargetLang(e.target.value)}
                                className="bg-zinc-100 dark:bg-zinc-800 border-transparent rounded-lg text-sm px-3 py-3 w-full focus:ring-2 focus:ring-blue-500 outline-none"
                            >
                                <option value="Vietnamese">Vietnamese</option>
                                <option value="English">English</option>
                                <option value="Spanish">Spanish</option>
                            </select>
                        </div>
                        
                        <div className="flex flex-col gap-1">
                            <label className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">AI Model</label>
                            <select 
                                value={model}
                                onChange={(e) => setModel(e.target.value as any)}
                                className="bg-zinc-100 dark:bg-zinc-800 border-transparent rounded-lg text-sm px-3 py-3 w-full focus:ring-2 focus:ring-blue-500 outline-none"
                            >
                                <option value="gemini-2.5-pro">Gemini 2.5 Pro (Best)</option>
                                <option value="gemini-2.5-flash">Gemini 2.5 Flash (Fast)</option>
                                <option value="gemini-3.1-pro-preview">Gemini 3.1 Pro</option>
                            </select>
                        </div>
                    </div>

                    <div className="flex flex-col gap-1">
                        <label className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Tone / Xưng hô</label>
                        <select 
                            value={tone}
                            onChange={(e) => setTone(e.target.value)}
                            className="bg-zinc-100 dark:bg-zinc-800 border-transparent rounded-lg text-sm px-3 py-3 w-full focus:ring-2 focus:ring-blue-500 outline-none"
                        >
                            <option value="Bình thường / Tự nhiên (tôi, bạn, anh, em...)">Bình thường / Tự nhiên</option>
                            <option value="Giang hồ / Cười đùa (mày, tao, ổng, bả...)">Giang hồ / Thô lỗ / Hài hước</option>
                            <option value="Nghiêm túc / Khoa học / Tài liệu">Nghiêm túc / Tài liệu</option>
                            <option value="Cổ trang / Kiếm hiệp (tại hạ, các hạ...)">Cổ trang / Kiếm hiệp</option>
                        </select>
                    </div>
                
                    <div className="flex flex-col gap-1">
                        <label className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Context chung của video (Giúp AI hiểu ngữ cảnh)</label>
                        <textarea
                            className="bg-zinc-100 dark:bg-zinc-800 border-transparent rounded-lg text-sm px-4 py-3 w-full h-32 focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                            placeholder="Mô tả bối cảnh video: Ví dụ, phim viễn tưởng về không gian..."
                            value={movieContext}
                            onChange={(e) => setMovieContext(e.target.value)}
                        ></textarea>
                    </div>
                </div>
            )}

            {activeTab === 'subtitles' && (
                <div className="h-full flex flex-col">
                    {tasks.length === 0 ? (
                    <div className="h-full flex items-center justify-center">
                         <div className="w-full max-w-2xl"><FileUpload onFilesSelect={handleFilesSelect} multiple={true} /></div>
                    </div>
                    ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 h-full min-h-[600px]">
                        
                        {/* Sidebar List */}
                        <div className="col-span-1 border-r border-zinc-200 dark:border-zinc-800 pr-6 overflow-y-auto">
                            <div className="flex justify-between items-center mb-4">
                                <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">SRT Files ({tasks.length})</h2>
                                <label className="text-xs font-medium text-blue-600 hover:underline cursor-pointer">
                                + Thêm File
                                <input type="file" accept=".srt" multiple className="hidden" onChange={(e) => e.target.files && handleFilesSelect(Array.from(e.target.files))} />
                                </label>
                            </div>
                            <div className="space-y-2 mb-6">
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
                                        {t.status === 'done' ? 'Hoàn thành' : t.status === 'translating' ? `${Math.round((t.progress.current / t.progress.total) * 100)}%` : t.status === 'error' ? 'Lỗi' : 'Chờ dịch'}
                                        </p>
                                    </div>
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); handleRemoveTask(t.id); }}
                                        className="text-zinc-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                    </div>
                                </div>
                                ))}
                            </div>
                            
                            <button 
                                onClick={() => tasks.filter(t => t.status === 'idle').forEach(t => handleTranslate(t.id))}
                                className="w-full py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition"
                            >
                                Dịch tất cả
                            </button>
                        </div>

                        {/* Main Editor */}
                        <div className="lg:col-span-3 h-full">
                        {activeTask ? (
                            <div className="border border-zinc-200 dark:border-zinc-800 rounded-2xl bg-white dark:bg-zinc-900 shadow-sm overflow-hidden flex flex-col h-full opacity-100">
                            
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
                                        <button onClick={() => handleTranslate(activeTask.id)} className="flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors">
                                        <ArrowRightLeft className="w-4 h-4" /> Bắt đầu dịch
                                        </button>
                                    ) : activeTask.status === 'translating' ? (
                                        <div className="flex items-center gap-4 px-4 text-blue-600 text-sm font-medium">
                                            <Loader2 className="w-4 h-4 animate-spin" /> Đang dịch ({Math.round((activeTask.progress.current / activeTask.progress.total) * 100)}%)
                                        </div>
                                    ) : (
                                        <button onClick={() => handleDownload(activeTask.id)} className="flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors">
                                        <Download className="w-4 h-4" /> Tải về SRT
                                        </button>
                                    )}
                                    </div>
                                </div>

                                {/* Viewer */}
                                <div className="flex-1 overflow-y-auto p-4 space-y-2 pb-24">
                                    {activeTask.subtitles.slice(0, Math.max(activeTask.progress.current + 20, 200)).map((sub, index) => {
                                    const translated = activeTask.translatedSubtitles[index];
                                    const isDone = translated && translated.text && activeTask.status !== 'idle';
                                    const isCurrent = activeTask.status === 'translating' && index >= activeTask.progress.current - 10 && index < activeTask.progress.current;
                                    
                                    return (
                                        <div key={sub.id} className={`grid grid-cols-[100px_1fr_1fr] md:grid-cols-[120px_1fr_1fr] gap-4 p-3 rounded-xl text-sm border transition-colors ${isCurrent ? 'border-blue-300 bg-blue-50 dark:bg-blue-900/20' : isDone ? 'border-green-100 bg-green-50/50 dark:border-green-900/30' : 'border-zinc-100 bg-zinc-50/30 dark:bg-zinc-900/30'}`}>
                                            <div className="text-xs text-zinc-400 font-mono flex flex-col justify-center">
                                                <div>{sub.startTime.split(',')[0]}</div>
                                                <div className="text-[10px] text-zinc-300 mt-1">to</div>
                                                <div>{sub.endTime.split(',')[0]}</div>
                                            </div>
                                            <div className="text-zinc-600 dark:text-zinc-300 py-1">{sub.text}</div>
                                            <div className={`py-1 font-medium ${isDone ? 'text-zinc-900 dark:text-zinc-100' : 'text-zinc-400 italic'}`}>
                                                {isDone ? translated.text : (activeTask.status === 'translating' && index < activeTask.progress.current + 10 ? 'Translating...' : 'Pending')}
                                            </div>
                                        </div>
                                    );
                                    })}
                                </div>
                            </div>
                        ) : (
                            <div className="h-full flex items-center justify-center border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl bg-zinc-50 dark:bg-zinc-900/50">
                            <p className="text-zinc-500">Chọn 1 file để xem</p>
                            </div>
                        )}
                        </div>
                    </div>
                    )}
                </div>
            )}
        </div>
      </main>
    </div>
  );
}

function NavItem({ icon, label, isActive, onClick }: { icon: React.ReactNode; label: string; isActive: boolean; onClick: () => void }) {
    return (
        <button 
            onClick={onClick}
            className={`w-full flex items-center lg:justify-start justify-center gap-3 p-3 rounded-xl transition-colors ${
                isActive ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 font-medium' : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-100'
            }`}
        >
            <div className="w-5 h-5 flex-shrink-0 flex items-center justify-center">
                {icon}
            </div>
            <span className="hidden lg:block text-sm">{label}</span>
        </button>
    )
}
