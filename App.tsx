
import React, { useState, useRef, useMemo, useEffect } from 'react';
import { 
  FileUp, Download, Settings as SettingsIcon, Printer, AlertCircle, 
  CheckCircle2, RefreshCw, Trash2, Plus, ArrowRight, Layers, Info,
  ChevronRight, Scissors, Copy, FileText, Undo2, LayoutGrid, Save, BookOpen, XCircle,
  ToggleLeft, ToggleRight, ArrowDownToLine
} from 'lucide-react';
import { PDFDocument } from 'pdf-lib';
import { BindingType, ImpositionConfig, PageItem, AppMode } from './types';
import { calculateImposition, processPdf } from './services/pdfService';

function PreviewBox(props: { item: PageItem | null; color: string; side?: string }) {
  const { item, color, side } = props;
  const isBlank = item?.type === 'blank';
  const opacityClass = item ? 'opacity-100' : 'opacity-10';
  const bgColor = isBlank ? 'bg-amber-50' : 'bg-white';
  const borderColor = isBlank ? 'border-amber-200' : `border-${color}-200`;
  const textColor = `text-${color}-600`;

  return (
    <div className={`w-full h-full flex flex-col items-center justify-center gap-1 ${opacityClass}`}>
      <div className={`w-10 h-14 rounded border flex items-center justify-center ${bgColor} ${borderColor} ${isBlank ? 'border-dashed' : ''} shadow-sm`}>
        <span className={`text-sm font-black ${textColor}`}>
          {isBlank ? 'B' : (item?.originalPageIndex !== undefined ? item.originalPageIndex + 1 : 'X')}
        </span>
      </div>
      {side && <p className={`text-[8px] font-black text-${color}-400 uppercase`}>{side}</p>}
    </div>
  );
}

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [activeMode, setActiveMode] = useState<AppMode>(AppMode.ORGANIZER);
  const [impositionEnabled, setImpositionEnabled] = useState(true);
  const [externalFiles, setExternalFiles] = useState<Map<string, File>>(new Map());
  const [pages, setPages] = useState<PageItem[]>([]);
  const [history, setHistory] = useState<PageItem[][]>([]);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  
  const [config, setConfig] = useState<ImpositionConfig>({
    paperSize: 'A4',
    outputSize: 'A5',
    binding: BindingType.SHORT_EDGE,
    rotateBack: false
  });
  
  const [processState, setProcessState] = useState({
    isProcessing: false,
    progress: 0,
    error: null as string | null,
    resultUrl: null as string | null
  });

  const [deleteInput, setDeleteInput] = useState('');
  const [insertConfig, setInsertConfig] = useState({ count: 1, position: 'after' as 'before' | 'after', target: 1 });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (processState.resultUrl && resultRef.current) {
      resultRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [processState.resultUrl]);

  // If imposition is disabled and we are on that tab, move back to organizer
  useEffect(() => {
    if (!impositionEnabled && activeMode === AppMode.IMPOSITION) {
      setActiveMode(AppMode.ORGANIZER);
    }
  }, [impositionEnabled, activeMode]);

  const saveToHistory = (newPages: PageItem[]) => {
    setHistory(prev => [...prev.slice(-19), pages]);
    setPages(newPages);
  };

  const undo = () => {
    if (history.length === 0) return;
    const prev = history[history.length - 1];
    setPages(prev);
    setHistory(prevHistory => prevHistory.slice(0, -1));
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected && selected.type === 'application/pdf') {
      try {
        const bytes = await selected.arrayBuffer();
        const pdfDoc = await PDFDocument.load(bytes);
        const count = pdfDoc.getPageCount();
        const initialPages: PageItem[] = Array.from({ length: count }, (_, i) => ({
          id: `orig-${i}-${Math.random()}`,
          type: 'original',
          originalPageIndex: i,
          label: `Page ${i + 1}`
        }));
        setFile(selected);
        setPages(initialPages);
        setHistory([]);
        setProcessState({ isProcessing: false, progress: 0, error: null, resultUrl: null });
      } catch (err) {
        setProcessState(prev => ({ ...prev, error: "Failed to load PDF. It might be encrypted or corrupted." }));
      }
    }
  };

  const parseDeleteRanges = (input: string) => {
    const indices = new Set<number>();
    const parts = input.split(',').map(p => p.trim());
    parts.forEach(part => {
      if (part.includes('-')) {
        const [start, end] = part.split('-').map(n => parseInt(n));
        if (!isNaN(start) && !isNaN(end)) {
          for (let i = Math.min(start, end); i <= Math.max(start, end); i++) indices.add(i - 1);
        }
      } else {
        const n = parseInt(part);
        if (!isNaN(n)) indices.add(n - 1);
      }
    });
    return Array.from(indices).filter(i => i >= 0 && i < pages.length);
  };

  const handleBulkDelete = () => {
    const toDelete = parseDeleteRanges(deleteInput);
    if (toDelete.length === 0) return;
    const newPages = pages.filter((_, idx) => !toDelete.includes(idx));
    saveToHistory(newPages);
    setDeleteInput('');
  };

  const handleInsertBlank = () => {
    const targetIdx = Math.max(0, Math.min(pages.length, insertConfig.target - (insertConfig.position === 'before' ? 1 : 0)));
    const newBlanks: PageItem[] = Array.from({ length: insertConfig.count }, (_, i) => ({
      id: `blank-${Date.now()}-${i}`,
      type: 'blank',
      label: 'Blank Page'
    }));
    const newPages = [...pages];
    newPages.splice(targetIdx, 0, ...newBlanks);
    saveToHistory(newPages);
  };

  const handleProcess = async (useImposition: boolean) => {
    if (!file) return;
    
    if (processState.resultUrl) {
      URL.revokeObjectURL(processState.resultUrl);
    }
    
    setProcessState({ isProcessing: true, progress: 0, error: null, resultUrl: null });
    
    try {
      const url = await processPdf(file, externalFiles, pages, config, useImposition, (progress) => {
        setProcessState(prev => ({ ...prev, progress }));
      });
      setProcessState({ isProcessing: false, progress: 100, error: null, resultUrl: url });
    } catch (err: any) {
      setProcessState({ 
        isProcessing: false, 
        progress: 0, 
        error: err.message || 'Unknown error occurred during PDF generation.', 
        resultUrl: null 
      });
    }
  };

  const impositionPreview = useMemo(() => calculateImposition(pages), [pages]);

  const onDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const onDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const onDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === targetIndex) return;

    const updatedPages = [...pages];
    const [movedItem] = updatedPages.splice(draggedIndex, 1);
    updatedPages.splice(targetIndex, 0, movedItem);
    
    saveToHistory(updatedPages);
    setDraggedIndex(null);
  };

  const tabs = [
    { mode: AppMode.ORGANIZER, label: '1. Organize', icon: LayoutGrid },
    ...(impositionEnabled ? [{ mode: AppMode.IMPOSITION, label: '2. Duplex Mode', icon: Scissors }] : []),
    { mode: AppMode.EXPORT, label: impositionEnabled ? '3. Export' : '2. Export', icon: Save }
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 font-sans">
      <header className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="bg-indigo-600 p-3 rounded-2xl shadow-xl">
            <BookOpen className="text-white w-8 h-8" />
          </div>
          <div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight">Duplex Studio</h1>
            <p className="text-slate-500 font-medium">Organize, Impose, and Print with precision.</p>
          </div>
        </div>

        {!file ? (
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-3 bg-slate-900 text-white px-8 py-4 rounded-2xl font-black hover:bg-black transition-all active:scale-95 shadow-xl"
          >
            <FileUp className="w-5 h-5" />
            SELECT PDF
            <input ref={fileInputRef} type="file" accept=".pdf" className="hidden" onChange={handleFileChange} />
          </button>
        ) : (
          <nav className="flex bg-slate-100 p-1.5 rounded-2xl shadow-inner">
            {tabs.map(tab => (
              <button
                key={tab.mode}
                onClick={() => setActiveMode(tab.mode)}
                className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-black text-sm transition-all ${
                  activeMode === tab.mode 
                    ? 'bg-white text-indigo-600 shadow-md' 
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </nav>
        )}
      </header>

      {!file ? (
        <div className="h-[400px] flex flex-col items-center justify-center border-4 border-dashed border-slate-200 rounded-[3rem] bg-slate-50">
           <Layers className="w-16 h-16 text-slate-200 mb-4" />
           <p className="text-slate-400 font-bold">Waiting for source file...</p>
        </div>
      ) : (
        <main className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-8 space-y-6">
            {activeMode === AppMode.ORGANIZER && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <section className="bg-white rounded-[2rem] p-8 shadow-sm border border-slate-200">
                  <div className="flex items-center justify-between mb-8">
                    <div>
                      <h2 className="text-xl font-black text-slate-900">Page Timeline</h2>
                      <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">Drag thumbnails to rearrange order</p>
                    </div>
                    <div className="flex gap-2">
                      <button 
                        onClick={undo} 
                        disabled={history.length === 0}
                        className="p-2 bg-slate-100 rounded-xl text-slate-600 disabled:opacity-30 hover:bg-slate-200 transition-colors"
                      >
                        <Undo2 className="w-5 h-5" />
                      </button>
                      <span className="bg-indigo-50 text-indigo-600 px-4 py-2 rounded-xl text-xs font-black uppercase">
                        {pages.length} Pages
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-4 max-h-[500px] overflow-y-auto p-4 bg-slate-50 rounded-3xl border border-slate-200 custom-scrollbar">
                    {pages.map((page, idx) => (
                      <div 
                        key={page.id} 
                        className="group relative"
                        draggable
                        onDragStart={(e) => onDragStart(e, idx)}
                        onDragOver={(e) => onDragOver(e, idx)}
                        onDrop={(e) => onDrop(e, idx)}
                      >
                        <div className={`aspect-[1/1.41] rounded-xl border-2 transition-all flex flex-col items-center justify-center p-2 shadow-sm cursor-grab active:cursor-grabbing ${
                          draggedIndex === idx ? 'opacity-40 border-indigo-400' : 
                          page.type === 'blank' ? 'bg-amber-50 border-dashed border-amber-200' : 'bg-white border-slate-200 hover:border-indigo-400'
                        }`}>
                          <span className="text-[10px] font-black text-slate-300 absolute top-2 left-3">{idx + 1}</span>
                          <p className="text-lg font-black text-slate-800 pointer-events-none select-none">
                            {page.type === 'blank' ? 'B' : (page.originalPageIndex !== undefined ? page.originalPageIndex + 1 : 'X')}
                          </p>
                        </div>
                        <div className="absolute -top-1 -right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                           <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              saveToHistory(pages.filter(p => p.id !== page.id));
                            }}
                            className="bg-red-500 text-white p-1 rounded-full shadow-lg hover:scale-110 transition-transform"
                           >
                            <Trash2 className="w-3 h-3" />
                           </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            )}

            {activeMode === AppMode.IMPOSITION && impositionEnabled && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <section className="bg-white rounded-[2rem] p-8 shadow-sm border border-slate-200">
                   <div className="flex items-center gap-3 mb-8">
                     < Scissors className="w-6 h-6 text-indigo-500" />
                     <h2 className="text-xl font-black text-slate-900">Physical Layout Preview</h2>
                   </div>
                   
                   <div className="space-y-8 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
                     {impositionPreview.map((sheet, idx) => (
                       <div key={idx} className="bg-slate-50 rounded-3xl p-6 border border-slate-100">
                         <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">A4 Sheet {idx + 1}</p>
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                           <div className="space-y-3">
                             <div className="flex justify-between items-center text-[10px] font-bold text-indigo-400">
                               <span>FRONT</span>
                               <span>{sheet.front.left?.label || 'Empty'} | {sheet.front.right?.label || 'Empty'}</span>
                             </div>
                             <div className="aspect-[1.41/1] bg-white border-2 border-indigo-100 rounded-2xl relative grid grid-cols-2 overflow-hidden shadow-sm">
                               <PreviewBox item={sheet.front.left} color="indigo" side="LEFT" />
                               <PreviewBox item={sheet.front.right} color="indigo" side="RIGHT" />
                               <div className="absolute inset-y-0 left-1/2 -ml-px w-px border-l-2 border-dashed border-indigo-50"></div>
                             </div>
                           </div>
                           <div className="space-y-3">
                             <div className="flex justify-between items-center text-[10px] font-bold text-slate-400">
                               <span>BACK (REVERSE)</span>
                               <span>{sheet.back.left?.label || 'Empty'} | {sheet.back.right?.label || 'Empty'}</span>
                             </div>
                             <div className={`aspect-[1.41/1] bg-white border-2 border-slate-200 rounded-2xl relative grid grid-cols-2 overflow-hidden shadow-sm transition-transform duration-700 ${config.rotateBack ? 'rotate-180' : ''}`}>
                               <PreviewBox item={sheet.back.left} color="slate" side="LEFT" />
                               <PreviewBox item={sheet.back.right} color="slate" side="RIGHT" />
                               <div className="absolute inset-y-0 left-1/2 -ml-px w-px border-l-2 border-dashed border-slate-50"></div>
                             </div>
                           </div>
                         </div>
                       </div>
                     ))}
                   </div>
                </section>
              </div>
            )}

            {activeMode === AppMode.EXPORT && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                 <section className="bg-white rounded-[2rem] p-8 shadow-sm border border-slate-200 text-center">
                    <div className="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-6">
                      <Save className="w-10 h-10 text-green-600" />
                    </div>
                    <h2 className="text-2xl font-black text-slate-900 mb-2">Ready to Output</h2>
                    <p className="text-slate-500 font-medium mb-10">Review your final configuration and choose your output type.</p>
                    
                    <div className={`grid grid-cols-1 ${impositionEnabled ? 'md:grid-cols-2' : ''} gap-4 text-left`}>
                       {impositionEnabled && (
                         <div className="p-6 bg-slate-50 rounded-3xl border border-slate-200 transition-all hover:border-indigo-300 group">
                            <h3 className="font-black text-slate-800 mb-2 flex items-center gap-2">
                              <Scissors className="w-4 h-4 text-indigo-600" /> Sequential Duplex
                            </h3>
                            <p className="text-xs text-slate-500 mb-6">A4 sheets with 4 logical A5 pages each. Correct order after middle cut.</p>
                            <button 
                              onClick={() => handleProcess(true)}
                              className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-100"
                            >
                              Generate Imposed PDF
                            </button>
                         </div>
                       )}
                       <div className={`p-6 bg-slate-50 rounded-3xl border transition-all hover:border-slate-300 group ${!impositionEnabled ? 'border-indigo-300 bg-indigo-50/20' : 'border-slate-200'}`}>
                          <h3 className="font-black text-slate-800 mb-2 flex items-center gap-2">
                            <FileText className="w-4 h-4 text-slate-600" /> Standard Sequential
                          </h3>
                          <p className="text-xs text-slate-500 mb-6">Exports your organized page sequence 1:1 using original page sizes.</p>
                          <button 
                            onClick={() => handleProcess(false)}
                            className="w-full py-4 bg-slate-800 text-white rounded-2xl font-black hover:bg-black transition-all flex items-center justify-center gap-2 shadow-lg shadow-slate-100"
                          >
                            Export Single Page Sequence
                          </button>
                       </div>
                    </div>

                    {processState.error && (
                      <div className="mt-8 p-6 bg-red-50 border-2 border-red-200 rounded-[2rem] flex flex-col items-center animate-in slide-in-from-top-4">
                        <XCircle className="w-8 h-8 text-red-500 mb-2" />
                        <p className="text-red-700 font-black">Something went wrong</p>
                        <p className="text-red-600 text-sm mt-1">{processState.error}</p>
                      </div>
                    )}

                    <div ref={resultRef}>
                      {processState.resultUrl && (
                        <div className="mt-10 p-8 bg-green-50 border-2 border-green-200 rounded-[3rem] flex flex-col items-center animate-in zoom-in-95 duration-500 shadow-xl shadow-green-100/50">
                           <div className="w-14 h-14 bg-green-500 rounded-full flex items-center justify-center mb-4 shadow-lg shadow-green-200">
                             <CheckCircle2 className="w-8 h-8 text-white" />
                           </div>
                           <p className="text-green-800 text-xl font-black mb-2 uppercase tracking-wide">Document is Ready!</p>
                           <p className="text-green-600 text-sm font-medium mb-8">Your {pages.length}-page PDF has been successfully processed.</p>
                           <a 
                            href={processState.resultUrl} 
                            download={`${impositionEnabled ? 'imposed_' : 'sequential_'}${file?.name || 'document.pdf'}`}
                            className="flex items-center gap-4 bg-green-600 text-white px-12 py-5 rounded-[2rem] font-black text-lg hover:bg-green-700 hover:scale-105 transition-all shadow-xl shadow-green-200 ring-4 ring-green-100"
                           >
                             <Download className="w-6 h-6" /> DOWNLOAD PDF
                           </a>
                        </div>
                      )}
                    </div>
                 </section>
              </div>
            )}
          </div>

          <div className="lg:col-span-4 space-y-6">
            <section className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 space-y-4">
               <div className="flex items-center justify-between mb-2">
                 <h3 className="font-black text-slate-800 flex items-center gap-2">
                  <Printer className="w-4 h-4 text-indigo-500" /> Print Mode
                 </h3>
                 <button 
                  onClick={() => setImpositionEnabled(!impositionEnabled)}
                  className={`flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-black transition-all ${impositionEnabled ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-500'}`}
                 >
                   {impositionEnabled ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                   {impositionEnabled ? 'IMPOSITION ON' : 'IMPOSITION OFF'}
                 </button>
               </div>
               <p className="text-[10px] text-slate-400 font-bold leading-relaxed">
                 {impositionEnabled 
                   ? "Currently generating 2-up book layouts for physical cutting. Output is A4 Landscape." 
                   : "Generating single-page sequential PDF. Original page sizes and orientation preserved."}
               </p>
            </section>

            {activeMode === AppMode.ORGANIZER && (
              <>
                <section className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 space-y-4">
                   <h3 className="font-black text-slate-800 flex items-center gap-2">
                    <Trash2 className="w-4 h-4 text-red-500" /> Bulk Deletion
                   </h3>
                   <div className="space-y-3">
                     <p className="text-[10px] text-slate-400 font-bold uppercase">Enter ranges (e.g. 1, 3, 10-15)</p>
                     <input 
                      type="text" 
                      placeholder="1, 4, 10-15..."
                      value={deleteInput}
                      onChange={e => setDeleteInput(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                     />
                     <button 
                      onClick={handleBulkDelete}
                      disabled={!deleteInput}
                      className="w-full py-3 bg-red-50 text-red-600 rounded-xl font-black text-xs hover:bg-red-100 disabled:opacity-50 transition-colors"
                     >
                      DELETE PAGES
                     </button>
                   </div>
                </section>

                <section className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 space-y-4">
                   <h3 className="font-black text-slate-800 flex items-center gap-2">
                    <Plus className="w-4 h-4 text-emerald-500" /> Insert Blank
                   </h3>
                   <div className="grid grid-cols-2 gap-3">
                     <div className="space-y-1">
                        <label className="text-[10px] text-slate-400 font-bold uppercase">Count</label>
                        <input 
                          type="number" min="1" 
                          value={insertConfig.count}
                          onChange={e => setInsertConfig({...insertConfig, count: parseInt(e.target.value) || 1})}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm"
                        />
                     </div>
                     <div className="space-y-1">
                        <label className="text-[10px] text-slate-400 font-bold uppercase">Target Page</label>
                        <input 
                          type="number" min="1" max={pages.length}
                          value={insertConfig.target}
                          onChange={e => setInsertConfig({...insertConfig, target: parseInt(e.target.value) || 1})}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm"
                        />
                     </div>
                   </div>
                   <div className="flex bg-slate-50 p-1 rounded-xl">
                      <button 
                        onClick={() => setInsertConfig({...insertConfig, position: 'before'})}
                        className={`flex-1 py-1.5 rounded-lg text-[10px] font-black transition-all ${insertConfig.position === 'before' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-400'}`}
                      >
                        BEFORE
                      </button>
                      <button 
                        onClick={() => setInsertConfig({...insertConfig, position: 'after'})}
                        className={`flex-1 py-1.5 rounded-lg text-[10px] font-black transition-all ${insertConfig.position === 'after' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-400'}`}
                      >
                        AFTER
                      </button>
                   </div>
                   <button 
                    onClick={handleInsertBlank}
                    className="w-full py-3 bg-emerald-50 text-emerald-600 rounded-xl font-black text-xs hover:bg-emerald-100 transition-colors"
                   >
                    INSERT BLANK(S)
                   </button>
                </section>
              </>
            )}

            {activeMode === AppMode.IMPOSITION && impositionEnabled && (
              <section className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 space-y-6">
                 <h3 className="font-black text-slate-800 flex items-center gap-2">
                  <SettingsIcon className="w-4 h-4 text-indigo-500" /> Duplex Logic
                 </h3>
                 <div className="space-y-3">
                   <p className="text-[10px] text-slate-400 font-bold uppercase">Printer Flip Direction</p>
                   <button 
                    onClick={() => setConfig({...config, rotateBack: false})}
                    className={`w-full p-4 rounded-2xl border-2 text-left transition-all ${!config.rotateBack ? 'border-indigo-500 bg-indigo-50' : 'border-slate-100 hover:bg-slate-50'}`}
                   >
                     <p className={`font-black text-sm ${!config.rotateBack ? 'text-indigo-600' : 'text-slate-700'}`}>Short Edge (Landscape Flip)</p>
                     <p className="text-[10px] text-slate-400">Pages stay upright when flipping side-to-side.</p>
                   </button>
                   <button 
                    onClick={() => setConfig({...config, rotateBack: true})}
                    className={`w-full p-4 rounded-2xl border-2 text-left transition-all ${config.rotateBack ? 'border-indigo-500 bg-indigo-50' : 'border-slate-100 hover:bg-slate-50'}`}
                   >
                     <p className={`font-black text-sm ${config.rotateBack ? 'text-indigo-600' : 'text-slate-700'}`}>Long Edge (Vertical Flip)</p>
                     <p className="text-[10px] text-slate-400">Rotates back side 180° for standard portrait duplex.</p>
                   </button>
                 </div>

                 <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100 flex gap-3">
                   <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0" />
                   <p className="text-[10px] text-amber-800 leading-relaxed font-medium">
                     <strong>CUT-AND-STACK LOGIC:</strong> This imposer keeps pages sequential. Page 2 is physically behind Page 1. After cutting the A4 stack, simply place the right stack under the left stack.
                   </p>
                 </div>
              </section>
            )}
          </div>
        </main>
      )}

      {processState.isProcessing && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-6">
           <div className="bg-white rounded-[3rem] p-12 max-w-md w-full shadow-2xl text-center space-y-6 animate-in zoom-in-95 duration-300">
             <div className="relative w-24 h-24 mx-auto">
               <RefreshCw className="w-full h-full text-indigo-600 animate-spin opacity-20" />
               <div className="absolute inset-0 flex items-center justify-center">
                 <span className="text-xl font-black text-indigo-600">{processState.progress}%</span>
               </div>
             </div>
             <h3 className="text-2xl font-black text-slate-900">Processing Document</h3>
             <p className="text-slate-500 font-medium">Sit tight. We're rearranging your pages with pixel-perfect precision.</p>
             <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
               <div 
                className="h-full bg-indigo-600 transition-all duration-300" 
                style={{ width: `${processState.progress}%` }}
               />
             </div>
           </div>
        </div>
      )}
    </div>
  );
}
