import React from 'react';
import { UploadCloud, FileText } from 'lucide-react';

interface FileUploadProps {
  onFilesSelect: (files: File[]) => void;
  accept?: string;
  multiple?: boolean;
}

export function FileUpload({ onFilesSelect, accept = ".srt", multiple = true }: FileUploadProps) {
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const files = (Array.from(e.dataTransfer.files) as File[]).filter(file => file.name.endsWith('.srt'));
      if (files.length > 0) {
        onFilesSelect(multiple ? files : [files[0]]);
      } else {
        alert('Please upload a valid .srt file.');
      }
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files) as File[];
      onFilesSelect(multiple ? files : [files[0]]);
    }
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className="border-2 border-dashed border-zinc-300 dark:border-zinc-700 hover:border-blue-500 dark:hover:border-blue-400 bg-zinc-50 dark:bg-zinc-900 rounded-xl p-12 text-center cursor-pointer transition-colors"
    >
      <label className="cursor-pointer flex flex-col items-center gap-4">
        <UploadCloud className="w-12 h-12 text-zinc-400" />
        <div className="space-y-1">
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Click or drag to upload SRT files
          </h3>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Only .srt format supported.
          </p>
        </div>
        <input
          type="file"
          accept={accept}
          multiple={multiple}
          onChange={handleChange}
          className="hidden"
        />
      </label>
    </div>
  );
}
