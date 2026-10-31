import { useState, useRef, useEffect } from 'react';
import { VerificationCountdown } from '@/components/bot-check/VerificationCountdown';
import { MainMenu } from '@/components/editor/MainMenu';
import { Timeline } from '@/components/editor/Timeline';
import { CanvasPreview } from '@/components/editor/CanvasPreview';
import { DirectoryPermissionModal } from '@/components/DirectoryPermissionModal';
import { useProjectStore } from '@/store/useProjectStore';

export default function App() {
  const [isVerified, setIsVerified] = useState(false);
  const [workspaceDirHandle, setWorkspaceDirHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [activeProjectDirHandle, setActiveProjectDirHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [view, setView] = useState<'menu' | 'editor'>('menu');

  const { project } = useProjectStore();

  const [timelineHeight, setTimelineHeight] = useState(280);
  const isDraggingRef = useRef(false);

  // Cari dan dapatkan Handle Subfolder Proyek Aktif di dalam Workspace Directory
  useEffect(() => {
    if (!workspaceDirHandle || !project.id || view !== 'editor') return;

    const resolveProjectHandle = async () => {
      try {
        // 1. Dapatkan subfolder berdasarkan folderName proyek jika ada
        if (project.folderName) {
          const projectHandle = await workspaceDirHandle.getDirectoryHandle(project.folderName, { create: true });
          setActiveProjectDirHandle(projectHandle);
          return;
        }

        // 2. Fallback pencarian manual berdasarkan ID proyek di subfolder
        for await (const entry of workspaceDirHandle.values()) {
          if (entry.kind === 'directory' && entry.name.includes(project.id)) {
            const projectHandle = await workspaceDirHandle.getDirectoryHandle(entry.name);
            setActiveProjectDirHandle(projectHandle);
            return;
          }
        }

        // 3. Fallback jika tidak ditemukan subfolder khusus: buat subfolder dengan ID proyek
        const fallbackName = `project_${project.id}`;
        const newProjectHandle = await workspaceDirHandle.getDirectoryHandle(fallbackName, { create: true });
        setActiveProjectDirHandle(newProjectHandle);
      } catch (err) {
        console.error('Gagal mendapatkan handle subfolder proyek:', err);
        setActiveProjectDirHandle(workspaceDirHandle);
      }
    };

    resolveProjectHandle();
  }, [workspaceDirHandle, project.id, project.folderName, view]);

  const handleMouseDown = (e: React.MouseEvent) => {
    isDraggingRef.current = true;
    e.preventDefault();

    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';

    const onMouseMove = (moveEvent: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const newHeight = window.innerHeight - moveEvent.clientY;
      if (newHeight >= 160 && newHeight <= window.innerHeight * 0.6) {
        setTimelineHeight(newHeight);
      }
    };

    const onMouseUp = () => {
      isDraggingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  return (
    <main className="h-screen w-screen relative overflow-hidden select-none bg-[#0c0d10] text-[#e0e2e8] font-['USSO','Inter',sans-serif]">
      {!isVerified ? (
        <VerificationCountdown onVerified={() => setIsVerified(true)} />
      ) : !workspaceDirHandle ? (
        <DirectoryPermissionModal
          onPermissionGranted={(dirHandle) => {
            setWorkspaceDirHandle(dirHandle);
          }}
        />
      ) : view === 'menu' ? (
        <MainMenu
          workspaceDirHandle={workspaceDirHandle}
          onStartNew={(handle?: FileSystemDirectoryHandle) => {
            if (handle) setActiveProjectDirHandle(handle);
            setView('editor');
          }}
          onLoadProject={(handle?: FileSystemDirectoryHandle) => {
            if (handle) setActiveProjectDirHandle(handle);
            setView('editor');
          }}
        />
      ) : (
        /* FULL EDITOR WORKSPACE */
        <div className="h-full w-full flex flex-col bg-[#0c0d10] overflow-hidden font-['USSO','Inter',sans-serif]">
          <header className="h-11 border-b border-[#d8308f]/30 bg-[#13151c] px-4 flex items-center justify-between shrink-0 z-30">
            <button
              onClick={() => setView('menu')}
              className="px-3 py-1 bg-[#181a24] hover:bg-[#222533] text-[#e0e2e8] font-bold text-xs rounded-lg border border-[#d8308f]/40 transition-all cursor-pointer flex items-center gap-1.5 font-mono"
            >
              <span>←</span>
              <span>MAIN MENU</span>
            </button>

            <div className="flex items-center gap-3">
              <span className="hidden md:inline-block text-[10px] px-2.5 py-0.5 rounded bg-[#181a24] text-[#f48fb1] border border-[#d8308f]/30 font-mono font-bold truncate max-w-[200px]">
                PROJECT: {activeProjectDirHandle?.name || workspaceDirHandle?.name}
              </span>

              <span className="hidden md:inline-block text-[10px] px-2 py-0.5 rounded bg-[#181a24] text-[#8a8f9e] border border-[#d8308f]/20 font-mono font-semibold">
                PRO ENGINE
              </span>

              <div className="flex items-center gap-1.5 text-sm font-bold tracking-wider text-[#e0e2e8]">
                <span className="text-[#f48fb1] font-extrabold">エサのー</span>
                <span className="text-[#f0f2f8] font-bold">ForVidz</span>
              </div>
            </div>
          </header>

          <div className="flex-1 w-full min-h-0 bg-[#0c0d10] p-3 flex items-center justify-center overflow-hidden relative">
            <CanvasPreview currentProjectDirHandle={activeProjectDirHandle || workspaceDirHandle} />
          </div>

          <div
            onMouseDown={handleMouseDown}
            className="h-1.5 w-full bg-[#13151c] hover:bg-[#d8308f]/40 border-y border-[#d8308f]/20 cursor-row-resize flex items-center justify-center transition-colors group z-20 touch-none"
          >
            <div className="w-10 h-0.5 rounded-full bg-[#404554] group-hover:bg-[#d8308f]" />
          </div>

          <div style={{ height: `${timelineHeight}px` }} className="shrink-0">
            <Timeline currentProjectDirHandle={activeProjectDirHandle || workspaceDirHandle} />
          </div>
        </div>
      )}
    </main>
  );
}