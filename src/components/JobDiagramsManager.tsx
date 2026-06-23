import React, { useState, useRef } from 'react';
import { Upload, Trash2, ExternalLink, FileText, Image as ImageIcon, Eye, EyeOff, Plus, AlertCircle } from 'lucide-react';
import { JobDiagram } from '../types';

interface JobDiagramsManagerProps {
  estimateId: string;
  diagrams?: JobDiagram[];
  drawingUrl?: string;
  drawingFileName?: string;
  drawingMimeType?: string;
  onDiagramsChange: (updatedDiagrams: JobDiagram[]) => void;
}

const DIAGRAM_TYPES = [
  'Fence layout diagram',
  'Measurement map',
  'Site plan',
  'Gate layout',
  'Material layout',
  'Customer uploaded drawing',
  'App-generated drawing',
  'Other Diagram'
];

export const JobDiagramsManager: React.FC<JobDiagramsManagerProps> = ({
  estimateId,
  diagrams = [],
  drawingUrl,
  drawingFileName,
  drawingMimeType,
  onDiagramsChange
}) => {
  const [title, setTitle] = useState('');
  const [type, setType] = useState(DIAGRAM_TYPES[0]);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setError(null);

    try {
      const base64Promise = new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result === 'string') {
            resolve(reader.result);
          } else {
            reject(new Error('Failed to read file as base64 string'));
          }
        };
        reader.onerror = (err) => reject(err);
        reader.readAsDataURL(file);
      });

      const base64Data = await base64Promise;
      const token = localStorage.getItem('company_admin_token');

      const response = await fetch('/api/estimates/write', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token || ''}`
        },
        body: JSON.stringify({
          action: 'upload-diagram',
          estimateId,
          filename: file.name,
          mimeType: file.type,
          size: file.size,
          base64Data,
          title: title.trim() || file.name,
          type,
          visibleToCrew: true
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to upload diagram');
      }

      if (data.success && data.diagram) {
        onDiagramsChange([...diagrams, data.diagram]);
        setTitle('');
        setType(DIAGRAM_TYPES[0]);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    } catch (err: any) {
      console.error('[DIAGRAM UPLOAD] Error:', err);
      setError(err?.message || 'Error uploading file. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = async (diagramId: string) => {
    if (!window.confirm('Are you sure you want to delete this diagram? This action cannot be undone.')) {
      return;
    }

    try {
      const token = localStorage.getItem('company_admin_token');
      const response = await fetch('/api/estimates/write', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token || ''}`
        },
        body: JSON.stringify({
          action: 'delete-diagram',
          estimateId,
          diagramId
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to delete diagram');
      }

      onDiagramsChange(diagrams.filter(d => d.diagramId !== diagramId));
    } catch (err: any) {
      console.error('[DIAGRAM DELETE] Error:', err);
      alert(err?.message || 'Failed to delete diagram.');
    }
  };

  const handleToggleVisibility = async (diagramId: string, currentVisibility: boolean) => {
    try {
      const token = localStorage.getItem('company_admin_token');
      const response = await fetch('/api/estimates/write', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token || ''}`
        },
        body: JSON.stringify({
          action: 'toggle-diagram-visibility',
          estimateId,
          diagramId,
          visibleToCrew: !currentVisibility
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to update visibility');
      }

      onDiagramsChange(
        diagrams.map(d => d.diagramId === diagramId ? { ...d, visibleToCrew: !currentVisibility } : d)
      );
    } catch (err: any) {
      console.error('[DIAGRAM VISIBILITY] Error:', err);
      alert(err?.message || 'Failed to update visibility.');
    }
  };

  return (
    <div id="job-diagrams-manager-root" className="bg-white rounded-3xl p-8 shadow-xl border-2 border-american-blue/10 space-y-8">
      {/* Header */}
      <div>
        <h3 className="text-sm font-black text-american-blue uppercase tracking-widest flex items-center gap-2">
          <span>Crew Job Diagrams & Site Plans</span>
        </h3>
        <p className="text-[10px] font-bold text-[#999999] uppercase tracking-widest mt-1">
          Add layouts, sketches, material maps, and site plans for the field crew
        </p>
      </div>

      {/* Legacy Drawing Banner */}
      {drawingUrl && (
        <div className="p-4 bg-american-blue/5 border border-american-blue/10 rounded-2xl flex items-start gap-4">
          <div className="p-2 bg-american-blue/10 text-american-blue rounded-xl mt-1">
            <FileText size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="text-xs font-black text-american-blue uppercase tracking-widest">Primary Estimate Drawing</h4>
            <p className="text-xs text-[#666666] mt-1 truncate font-medium">
              {drawingFileName || 'Primary Project Drawing / Site Plan'}
            </p>
            <span className="inline-block px-2 py-0.5 bg-american-blue text-white rounded text-[8px] font-black uppercase tracking-widest mt-2">
              Always Visible to Crew
            </span>
          </div>
          <a
            href={drawingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-american-blue hover:underline whitespace-nowrap self-center"
          >
            View <ExternalLink size={12} />
          </a>
        </div>
      )}

      {/* Upload/Add Section */}
      <div className="bg-[#FBFBFB] border-2 border-[#F0F0F0] rounded-2xl p-6 space-y-4">
        <h4 className="text-[11px] font-black text-american-blue uppercase tracking-widest">Upload New Diagram</h4>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-[9px] font-black text-[#999999] uppercase tracking-widest mb-1.5">
              Diagram Title
            </label>
            <input
              type="text"
              placeholder="e.g. Back Gate Post Layout"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={isUploading}
              className="w-full px-4 py-3 bg-white border border-[#E5E5E5] rounded-xl text-xs font-bold text-american-blue placeholder:text-[#BBBBBB] focus:outline-none focus:border-american-blue transition-colors"
            />
          </div>

          <div>
            <label className="block text-[9px] font-black text-[#999999] uppercase tracking-widest mb-1.5">
              Diagram Type
            </label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              disabled={isUploading}
              className="w-full px-4 py-3 bg-white border border-[#E5E5E5] rounded-xl text-xs font-bold text-american-blue focus:outline-none focus:border-american-blue transition-colors appearance-none"
              style={{ backgroundImage: 'url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%231A2B4C\' stroke-width=\'2\' stroke-linecap=\'round\' stroke-linejoin=\'round\'%3e%3cpolyline points=\'6 9 12 15 18 9\'%3e%3c/polyline%3e%3c/svg%3e")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 16px center', backgroundSize: '12px' }}
            >
              {DIAGRAM_TYPES.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 bg-american-red/10 border border-american-red/20 text-american-red rounded-xl text-xs font-bold">
            <AlertCircle size={14} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex justify-end pt-2">
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            accept="application/pdf,image/jpeg,image/png,image/webp"
            onChange={handleUpload}
            disabled={isUploading}
          />
          <button
            type="button"
            disabled={isUploading}
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 px-6 py-3 bg-american-blue text-white rounded-xl text-xs font-black uppercase tracking-widest hover:scale-105 active:scale-95 disabled:opacity-50 transition-transform shadow-md shadow-american-blue/20"
          >
            <Upload size={14} />
            {isUploading ? 'Uploading...' : 'Upload & Attach Diagram'}
          </button>
        </div>
      </div>

      {/* Diagrams List */}
      <div className="space-y-4">
        <h4 className="text-[11px] font-black text-american-blue uppercase tracking-widest">
          Attached Diagrams ({diagrams.length})
        </h4>

        {diagrams.length === 0 ? (
          <div className="py-8 flex flex-col items-center justify-center border-2 border-dashed border-[#F0F0F0] rounded-2xl">
            <ImageIcon size={32} className="text-[#BBBBBB] mb-2" />
            <p className="text-[10px] font-black text-[#999999] uppercase tracking-widest">No Diagrams Attached Yet</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {diagrams.map((diag) => {
              const isPdf = diag.fileUrl.toLowerCase().includes('.pdf');
              return (
                <div
                  key={diag.diagramId}
                  className="bg-[#FBFBFB] border border-[#E5E5E5] hover:border-american-blue/30 rounded-2xl p-4 flex flex-col justify-between transition-colors space-y-3"
                >
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-white border border-[#E5E5E5] text-american-blue rounded-xl shrink-0">
                      {isPdf ? <FileText size={20} /> : <ImageIcon size={20} />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h5 className="text-xs font-black text-american-blue truncate uppercase tracking-wider" title={diag.title}>
                        {diag.title}
                      </h5>
                      <span className="inline-block text-[9px] font-black px-2 py-0.5 bg-american-blue/10 text-american-blue rounded-md uppercase tracking-widest mt-1">
                        {diag.type}
                      </span>
                      <p className="text-[9px] font-bold text-[#999999] uppercase tracking-widest mt-1">
                        By {diag.createdBy || 'Office'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-[#F0F0F0]">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleToggleVisibility(diag.diagramId, diag.visibleToCrew)}
                        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest border transition-colors ${
                          diag.visibleToCrew
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                            : 'bg-[#F3F4F6] text-gray-500 border-gray-200 hover:bg-gray-200'
                        }`}
                        title={diag.visibleToCrew ? 'Visible to Crew' : 'Hidden from Crew'}
                      >
                        {diag.visibleToCrew ? <Eye size={11} /> : <EyeOff size={11} />}
                        <span>{diag.visibleToCrew ? 'Visible to Crew' : 'Hidden'}</span>
                      </button>
                    </div>

                    <div className="flex items-center gap-2">
                      <a
                        href={diag.fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 bg-white hover:bg-american-blue/10 border border-[#E5E5E5] text-american-blue rounded-lg transition-colors"
                        title="View Fullscreen"
                      >
                        <ExternalLink size={12} />
                      </a>
                      <button
                        type="button"
                        onClick={() => handleDelete(diag.diagramId)}
                        className="p-1.5 bg-white hover:bg-american-red/10 border border-[#E5E5E5] text-american-red rounded-lg transition-colors"
                        title="Delete Diagram"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
