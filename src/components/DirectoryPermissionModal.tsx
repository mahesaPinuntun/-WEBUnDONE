import React, { useState, useEffect } from 'react';
import { FolderCheck, FolderPlus, HardDrive, ShieldCheck, AlertCircle } from 'lucide-react';
import {
  saveDirectoryHandle,
  getStoredDirectoryHandle,
  verifyPermission,
} from '@/utils/fileSystem';

interface Props {
  onPermissionGranted: (handle: FileSystemDirectoryHandle) => void;
}

export const DirectoryPermissionModal: React.FC<Props> = ({ onPermissionGranted }) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [existingHandle, setExistingHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Check if user has previously granted folder permission
  useEffect(() => {
    async function checkExistingPermission() {
      const stored = await getStoredDirectoryHandle();
      if (stored) {
        setExistingHandle(stored);
      }
      setLoading(false);
    }
    checkExistingPermission();
  }, []);

  // Request user to select a folder on their hard drive
  const handleSelectFolder = async () => {
    try {
      setErrorMsg(null);
      if (typeof window.showDirectoryPicker !== 'function') {
        setErrorMsg('Browser Anda tidak mendukung File System Access API. Gunakan Chrome atau Edge.');
        return;
      }

      const handle = await window.showDirectoryPicker({
        mode: 'readwrite',
      });

      await saveDirectoryHandle(handle);
      onPermissionGranted(handle);
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setErrorMsg('Gagal mendapatkan izin folder atau permintaan dibatalkan.');
      }
    }
  };

  // Re-authorize previously selected folder
  const handleReAuthorize = async () => {
    if (!existingHandle) return;
    try {
      setErrorMsg(null);
      const isGranted = await verifyPermission(existingHandle, true);
      if (isGranted) {
        onPermissionGranted(existingHandle);
      } else {
        setErrorMsg('Izin ditolak. Silakan pilih folder kembali.');
      }
    } catch {
      setErrorMsg('Gagal memverifikasi ulang izin folder.');
    }
  };

  if (loading) return null;

  return (
    <div className="fixed inset-0 z-50 bg-[#0c0d10]/95 backdrop-blur-md flex items-center justify-center p-4 font-['USSO','Inter',sans-serif] text-[#e0e2e8]">
      <div className="max-w-md w-full bg-[#13151c] border border-[#d8308f]/50 rounded-2xl p-6 shadow-2xl flex flex-col items-center text-center relative overflow-hidden">
        
        {/* Glow Background */}
        <div className="absolute -top-16 -left-16 w-32 h-32 bg-[#d8308f]/20 rounded-full blur-3xl pointer-events-none" />

        <div className="w-16 h-16 rounded-2xl bg-[#2a1826] border border-[#d8308f]/60 flex items-center justify-center mb-4 text-[#f48fb1]">
          <HardDrive className="w-8 h-8" />
        </div>

        <h2 className="text-lg font-bold tracking-wider text-[#e0e2e8] uppercase mb-1">
          LOCAL STORAGE PERMISSION
        </h2>
        <p className="text-xs text-[#8a8f9e] mb-6 leading-relaxed">
          Pilih folder di komputer Anda untuk menyimpan file project dan media terimpor secara langsung di hard drive lokal.
        </p>

        {errorMsg && (
          <div className="w-full bg-[#3d1825] border border-[#d8308f]/60 rounded-xl p-3 mb-4 text-xs text-[#f48fb1] flex items-center gap-2 font-mono">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <div className="w-full space-y-3">
          {existingHandle ? (
            <button
              onClick={handleReAuthorize}
              className="w-full py-3 px-4 bg-[#2d1b28] hover:bg-[#3d2035] text-[#f48fb1] border border-[#d8308f] rounded-xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer transition-all shadow-lg"
            >
              <FolderCheck className="w-4 h-4" />
              <span>OTORISASI ULANG "{existingHandle.name}"</span>
            </button>
          ) : (
            <button
              onClick={handleSelectFolder}
              className="w-full py-3 px-4 bg-[#2d1b28] hover:bg-[#3d2035] text-[#f48fb1] border border-[#d8308f] rounded-xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer transition-all shadow-lg"
            >
              <FolderPlus className="w-4 h-4" />
              <span>PILIH FOLDER WORKSPACE</span>
            </button>
          )}

          {existingHandle && (
            <button
              onClick={handleSelectFolder}
              className="w-full py-2 px-4 bg-[#181a24] hover:bg-[#222533] text-[#8a8f9e] hover:text-[#e0e2e8] border border-[#2f3342] rounded-xl font-bold text-[11px] uppercase tracking-wider transition-all cursor-pointer"
            >
              PILIH FOLDER LAIN
            </button>
          )}
        </div>

        <div className="mt-6 flex items-center gap-1.5 text-[10px] text-[#6e7382] font-mono">
          <ShieldCheck className="w-3.5 h-3.5 text-[#f48fb1]" />
          <span>File disimpan secara lokal di komputer Anda tanpa diunggah ke server luar.</span>
        </div>
      </div>
    </div>
  );
};