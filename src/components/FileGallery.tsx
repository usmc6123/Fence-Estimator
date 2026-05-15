import React from 'react';
import { Camera, Upload, X, Image as ImageIcon, Trash2 } from 'lucide-react';
import { JobPhoto } from '../types';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

interface FileGalleryProps {
  photos: JobPhoto[];
  onAddPhoto: (photo: JobPhoto) => void;
  onRemovePhoto: (id: string) => void;
  title?: string;
}

export default function FileGallery({ photos, onAddPhoto, onRemovePhoto, title = "Project Photos" }: FileGalleryProps) {
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const cameraInputRef = React.useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, isCamera = false) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      if (typeof event.target?.result === 'string') {
        const newPhoto: JobPhoto = {
          id: Math.random().toString(36).substr(2, 9),
          url: event.target.result,
          timestamp: new Date().toISOString(),
          category: 'Site'
        };
        onAddPhoto(newPhoto);
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-black text-american-blue uppercase tracking-widest">{title}</h3>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => cameraInputRef.current?.click()}
            className="p-2 bg-american-red text-white rounded-lg hover:scale-110 active:scale-95 transition-all shadow-md shadow-american-red/20"
            title="Take Photo"
          >
            <Camera size={16} />
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="p-2 bg-american-blue text-white rounded-lg hover:scale-110 active:scale-95 transition-all shadow-md shadow-american-blue/20"
            title="Upload Photo"
          >
            <Upload size={16} />
          </button>
        </div>
      </div>

      <input
        type="file"
        ref={fileInputRef}
        onChange={(e) => handleFileChange(e)}
        accept="image/*"
        className="hidden"
      />
      <input
        type="file"
        ref={cameraInputRef}
        onChange={(e) => handleFileChange(e, true)}
        accept="image/*"
        capture="environment"
        className="hidden"
      />

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        <AnimatePresence>
          {photos.map((photo) => (
            <motion.div
              key={photo.id}
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="group relative aspect-square rounded-xl overflow-hidden border border-white/10 bg-white/5"
            >
              <img
                src={photo.url}
                alt="Project site"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => onRemovePhoto(photo.id)}
                  className="p-2 bg-american-red text-white rounded-lg hover:scale-110 transition-all"
                >
                  <Trash2 size={14} />
                </button>
              </div>
              {photo.category && (
                <div className="absolute bottom-2 left-2 px-1.5 py-0.5 bg-american-blue/80 text-white text-[8px] font-black uppercase rounded">
                  {photo.category}
                </div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>

        {photos.length === 0 && (
          <div className="col-span-full py-10 flex flex-col items-center justify-center border-2 border-dashed border-white/10 rounded-2xl opacity-30">
            <ImageIcon size={32} className="text-white mb-2" />
            <p className="text-[10px] font-black text-white uppercase tracking-widest">No Photos Yet</p>
          </div>
        )}
      </div>
    </div>
  );
}
