import React, { useState, useEffect } from 'react';
import { useProjectStore } from '@/store/useProjectStore';
import { createProjectFolderPackage } from '@/utils/fileSystem';

interface Props {
  workspaceDirHandle: FileSystemDirectoryHandle | null;
  onStartNew: (handle?: FileSystemDirectoryHandle) => void;
  onLoadProject: (handle?: FileSystemDirectoryHandle) => void;
}

interface GPUDetails {
  renderer: string;
  clockSpeedMHz: number | string;
  vramMB: number | string;
  maxTextureSize: number | string;
  webglVersion: string;
}

export const translations = {
  appTitle: 'エサのーForVidz',
  appSub: 'High-Performance Client-Side Hardware Accelerated Video Processing Engine',
  version: 'VER.SIS: 0.1.0-ALPHA',
  newProject: 'NEW PROJECT',
  newProjectDesc: 'Create a fresh video sequence timeline powered by WebGL rendering.',
  loadProject: 'OPEN LOCAL PROJECT',
  loadProjectDesc: 'Open an existing ForVidz project folder from your local hard drive.',
  about: 'SYSTEM INFO',
  aboutDesc: 'High-performance web-based video editor built with WebGL and React.',
  aboutDetails: [
    '100% Client-Side Video Processing',
    'Zero Server Uploads & Absolute Data Privacy',
    'Multi-Track Realtime WebGL Render Engine',
  ],
  close: 'CLOSE',
  hardwareProbe: '// GRAPHICS HARDWARE PROBE',
};

export const MainMenu: React.FC<Props> = ({ workspaceDirHandle, onStartNew, onLoadProject }) => {
  const [showAbout, setShowAbout] = useState(false);
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  // Form New Project State
  const [projName, setProjName] = useState('Master Sequence 1');
  const [widthX, setWidthX] = useState<number>(1920);
  const [heightY, setHeightY] = useState<number>(1080);
  const [targetFps, setTargetFps] = useState<number>(60);

  const [gpuInfo, setGpuInfo] = useState<GPUDetails>({
    renderer: 'PROBING GRAPHICS CARD...',
    clockSpeedMHz: 'DYNAMIC',
    vramMB: 'UNKNOWN',
    maxTextureSize: 0,
    webglVersion: 'PROBING...',
  });

  const t = translations;
  const { createNewProject } = useProjectStore();

  const handleCreateConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreating(true);

    try {
      if (createNewProject) {
        createNewProject(projName, Number(widthX), Number(heightY), Number(targetFps));
      }

      const latestFolderName = useProjectStore.getState().project.folderName;
      let createdPackageHandle: FileSystemDirectoryHandle | undefined = undefined;

      if (workspaceDirHandle && latestFolderName) {
        const projectConfig = {
          name: projName,
          width: Number(widthX),
          height: Number(heightY),
          fps: Number(targetFps),
          createdAt: new Date().toISOString(),
          duration: 30,
          tracks: [],
        };

        // PERBAIKAN TS6133: Menghapus 'projectPath' karena tidak pernah digunakan
        const { projectDirHandle } = await createProjectFolderPackage(
          workspaceDirHandle,
          latestFolderName,
          projectConfig
        );
        createdPackageHandle = projectDirHandle;
      }

      setShowNewProjectModal(false);
      onStartNew(createdPackageHandle);
    } catch (err) {
      console.error('Failed to create editing package folder:', err);
      alert('Gagal membuat folder package project di hard drive.');
    } finally {
      setIsCreating(false);
    }
  };

  const handleLoadLocalProject = async () => {
    try {
      if (!('showDirectoryPicker' in window)) {
        alert('Browser Anda tidak mendukung File System Access API. Gunakan Chrome, Edge, atau Opera versi terbaru.');
        return;
      }
      
      const dirHandle = await (window as any).showDirectoryPicker({
        mode: 'readwrite',
      });
      
      try {
        const fileHandle = await dirHandle.getFileHandle('project.json');
        const file = await fileHandle.getFile();
        const text = await file.text();
        const parsedProject = JSON.parse(text);

        const mediaMap = new Map<string, string>();
        try {
          const mediaDir = await dirHandle.getDirectoryHandle('media');
          for await (const entry of mediaDir.values()) {
            if (entry.kind === 'file') {
              const mediaFileHandle = entry as FileSystemFileHandle;
              const mediaFile = await mediaFileHandle.getFile();
              const freshBlobUrl = URL.createObjectURL(mediaFile);
              mediaMap.set(mediaFile.name, freshBlobUrl);
            }
          }
        } catch (mediaErr) {
          console.warn('Folder media tidak ditemukan atau kosong.');
        }

        if (parsedProject.tracks && Array.isArray(parsedProject.tracks)) {
          parsedProject.tracks.forEach((track: any) => {
            if (track.clips && Array.isArray(track.clips)) {
              track.clips.forEach((clip: any) => {
                if (clip.name && mediaMap.has(clip.name)) {
                  clip.fileUrl = mediaMap.get(clip.name);
                }
              });
            }
          });
        }

        useProjectStore.setState((state) => ({ 
          project: {
            ...state.project, 
            ...parsedProject,
            currentTime: parsedProject.currentTime ?? 0, 
            duration: parsedProject.duration ?? state.project.duration ?? 30,
            fps: parsedProject.fps ?? state.project.fps ?? 60
          } 
        }));

      } catch (readErr) {
        console.error('Gagal membaca data project:', readErr);
        alert('Folder yang dipilih bukan folder project ForVidz yang valid (project.json tidak ditemukan).');
        return; 
      }
      
      onLoadProject(dirHandle);
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error('Error picking directory:', err);
        alert('Gagal memuat project dari Local Drive.');
      }
    }
  };

  useEffect(() => {
    // Probe hardware GPU sesungguhnya (sesuai kapabilitas API Browser)
    try {
      const canvas = document.createElement('canvas');
      const gl = (canvas.getContext('webgl2') || canvas.getContext('webgl')) as WebGLRenderingContext | null;

      if (gl) {
        const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
        // Ekstrak nama asli hardware yang terbaca browser
        const rendererStr = debugInfo
          ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
          : gl.getParameter(gl.RENDERER);
          
        const maxTexture = gl.getParameter(gl.MAX_TEXTURE_SIZE);

        setGpuInfo({
          renderer: rendererStr || 'GENERIC WEBGL RENDERER',
          // Browser tidak mengizinkan baca Clock dan VRAM murni secara langsung, kita tampilkan sesuai faktanya
          clockSpeedMHz: 'UNAVAILABLE (RESTRICTED BY BROWSER)',
          vramMB: 'UNAVAILABLE (RESTRICTED BY BROWSER)',
          maxTextureSize: maxTexture,
          webglVersion: canvas.getContext('webgl2') ? 'WEBGL 2.0 (ACTIVE)' : 'WEBGL 1.0 (FALLBACK)',
        });
      } else {
         throw new Error("WebGL Not Supported");
      }
    } catch (err) {
      // PERBAIKAN: Jika WebGL tidak didukung, jangan gunakan data palsu.
      setGpuInfo({
        renderer: 'HARDWARE ACCELERATION NOT DETECTED (SOFTWARE MODE)',
        clockSpeedMHz: 'N/A',
        vramMB: 'N/A',
        maxTextureSize: 'N/A',
        webglVersion: 'WEBGL NOT ACTIVE',
      });
    }
  }, []);

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center p-3 sm:p-6 overflow-hidden font-['USSO','Inter',sans-serif] bg-[#0c0d10] text-[#e0e2e8] select-none">
      
      <div className="w-full max-w-[1320px] grid grid-cols-1 md:grid-cols-3 gap-[7px] z-10 my-auto">
        <div className="bg-[#13151c] border border-[#d8308f]/30 hover:border-[#d8308f]/60 rounded-xl p-5 sm:p-7 md:col-span-2 transition-colors duration-200">
          <div className="flex flex-col justify-between h-full min-h-[140px] sm:min-h-[200px]">
            <div>
              <div className="inline-block px-2.5 py-0.5 mb-3 rounded border border-[#d8308f]/40 bg-[#1d1f2a] text-[10px] sm:text-xs text-[#e571b6] font-semibold tracking-wider uppercase">
                {t.version}
              </div>
              <h1 className="text-3xl sm:text-5xl font-bold tracking-tight text-[#f0f2f8] stroke-magenta">
                <span className="text-[#f48fb1] border-b border-[#d8308f]/50 pb-0.5">{t.appTitle.substring(0, 4)}</span>
                <span>{t.appTitle.substring(4)}</span>
              </h1>
              <p className="text-xs sm:text-sm text-[#8a8f9e] font-normal mt-2 sm:mt-3 max-w-2xl leading-relaxed">
                {t.appSub}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-[10px] text-[#6e7382] font-mono mt-4 pt-3 border-t border-[#1f222e]">
              <span className="text-[#d8308f]/80 font-bold">// HARDWARE ACCELERATED</span>
              <span className="hidden sm:inline">•</span>
              <span>ZERO SERVER UPLOADS</span>
              <span className="hidden sm:inline">•</span>
              <span className="hidden sm:inline">OFFLINE PERSISTENT</span>
            </div>
          </div>
        </div>

        <button
          onClick={() => setShowNewProjectModal(true)}
          className="bg-[#13151c] hover:bg-[#181a24] border border-[#d8308f]/30 hover:border-[#d8308f]/80 rounded-xl p-5 sm:p-7 text-left cursor-pointer transition-all duration-200"
        >
          <div className="flex flex-col justify-between h-full min-h-[110px] sm:min-h-[200px]">
            <div className="flex justify-between items-start">
              <span className="text-xs text-[#e571b6] font-mono font-bold">01 // WORKSPACE</span>
              <span className="w-1.5 h-1.5 rounded-full bg-[#d8308f]" />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-[#f0f2f8] mt-2 md:mt-0">{t.newProject}</h2>
              <p className="text-xs text-[#8a8f9e] font-normal mt-1.5 leading-relaxed">{t.newProjectDesc}</p>
            </div>
          </div>
        </button>

        <button
          onClick={handleLoadLocalProject}
          className="bg-[#13151c] hover:bg-[#181a24] border border-[#d8308f]/30 hover:border-[#d8308f]/80 rounded-xl p-5 sm:p-7 text-left cursor-pointer transition-all duration-200"
        >
          <div className="flex flex-col justify-between h-full min-h-[110px] sm:min-h-[160px]">
            <div className="flex justify-between items-start">
              <span className="text-xs text-[#e571b6] font-mono font-bold">02 // LOCAL DRIVE</span>
              <span className="text-[10px] text-[#6e7382] font-mono">FILE SYSTEM</span>
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-[#f0f2f8] mt-2 md:mt-0">{t.loadProject}</h2>
              <p className="text-xs text-[#8a8f9e] font-normal mt-1.5 leading-relaxed">{t.loadProjectDesc}</p>
            </div>
          </div>
        </button>

        <button
          onClick={() => setShowAbout(true)}
          className="bg-[#13151c] hover:bg-[#181a24] border border-[#d8308f]/30 hover:border-[#d8308f]/80 rounded-xl p-5 sm:p-7 text-left cursor-pointer transition-all duration-200"
        >
          <div className="flex flex-col justify-between h-full min-h-[100px] sm:min-h-[160px]">
            <span className="text-xs text-[#e571b6] font-mono font-bold">03 // INFO</span>
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-[#f0f2f8] mt-2 md:mt-0">{t.about}</h2>
              <p className="text-xs text-[#8a8f9e] font-normal mt-1 leading-relaxed">{t.aboutDesc}</p>
            </div>
          </div>
        </button>

        <div className="bg-[#13151c] border border-[#d8308f]/30 hover:border-[#d8308f]/60 rounded-xl p-5 sm:p-7 transition-colors duration-200">
          <div className="flex flex-col justify-between h-full min-h-[130px] sm:min-h-[160px]">
            <div>
              <span className="text-xs text-[#e571b6] font-mono font-bold block mb-1">{t.hardwareProbe}</span>
              <div className="text-[10px] sm:text-xs font-bold text-[#d0d3de] leading-tight mb-2 uppercase font-mono">
                {gpuInfo.renderer}
              </div>
            </div>
            <div className="space-y-1.5 text-[9px] sm:text-[10px] font-mono">
              <div className="flex justify-between items-center border-b border-[#1f222e] pb-1">
                <span className="text-[#6e7382]">CLOCK SPEED :</span>
                <span className="text-[#e0e2e8] font-semibold">{gpuInfo.clockSpeedMHz}</span>
              </div>
              <div className="flex justify-between items-center border-b border-[#1f222e] pb-1">
                <span className="text-[#6e7382]">VRAM :</span>
                <span className="text-[#e0e2e8] font-semibold">{gpuInfo.vramMB}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[#6e7382]">API ENGINE :</span>
                <span className="text-[#e571b6] font-semibold">{gpuInfo.webglVersion}</span>
              </div>
            </div>
          </div>
        </div>

      </div>

      {showNewProjectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#060709]/85 backdrop-blur-sm">
          <div className="bg-[#13151c] border border-[#d8308f]/50 rounded-xl max-w-md w-full p-6 text-left shadow-2xl">
            <h3 className="text-base font-bold text-[#f0f2f8] mb-4 font-mono border-b border-[#d8308f]/30 pb-2">// CREATE NEW SEQUENCE</h3>
            <form onSubmit={handleCreateConfirm} className="space-y-3.5 text-xs font-mono">
              <div>
                <label className="block text-[#8a8f9e] mb-1 font-medium">SEQUENCE NAME</label>
                <input type="text" value={projName} onChange={(e) => setProjName(e.target.value)} className="w-full px-3 py-2 bg-[#181a24] border border-[#2f3342] focus:border-[#d8308f] rounded-lg text-[#e0e2e8] outline-none" required disabled={isCreating} />
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[#8a8f9e] mb-1 font-medium">WIDTH (PX)</label>
                  <input type="number" value={widthX} onChange={(e) => setWidthX(Number(e.target.value))} className="w-full px-3 py-2 bg-[#181a24] border border-[#2f3342] focus:border-[#d8308f] rounded-lg text-[#e0e2e8] outline-none" required disabled={isCreating} />
                </div>
                <div>
                  <label className="block text-[#8a8f9e] mb-1 font-medium">HEIGHT (PX)</label>
                  <input type="number" value={heightY} onChange={(e) => setHeightY(Number(e.target.value))} className="w-full px-3 py-2 bg-[#181a24] border border-[#2f3342] focus:border-[#d8308f] rounded-lg text-[#e0e2e8] outline-none" required disabled={isCreating} />
                </div>
              </div>
              <div>
                <label className="block text-[#8a8f9e] mb-1 font-medium">TARGET FRAME RATE (FPS)</label>
                <select value={targetFps} onChange={(e) => setTargetFps(Number(e.target.value))} className="w-full px-3 py-2 bg-[#181a24] border border-[#2f3342] focus:border-[#d8308f] rounded-lg text-[#e0e2e8] outline-none cursor-pointer" disabled={isCreating}>
                  <option value={24}>24 FPS (Cinematic Film)</option>
                  <option value={30}>30 FPS (Standard Broadcast)</option>
                  <option value={60}>60 FPS (High Smoothness)</option>
                  <option value={120}>120 FPS (Ultra High Frame Rate)</option>
                </select>
              </div>
              <div className="flex items-center justify-end gap-2.5 pt-3">
                <button type="button" onClick={() => setShowNewProjectModal(false)} disabled={isCreating} className="px-4 py-2 bg-[#1d1f2a] hover:bg-[#252836] text-[#a0a5b5] font-semibold rounded-lg cursor-pointer transition-colors">CANCEL</button>
                <button type="submit" disabled={isCreating} className="px-5 py-2 bg-[#2d1b28] hover:bg-[#3d2035] text-[#f48fb1] border border-[#d8308f]/60 font-bold rounded-lg cursor-pointer transition-colors flex items-center gap-2">
                  {isCreating ? 'CREATING PACKAGE...' : 'START EDITING'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showAbout && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#060709]/85 backdrop-blur-sm">
          <div className="bg-[#13151c] border border-[#d8308f]/50 rounded-xl max-w-lg w-full text-left p-6 shadow-2xl">
            <h3 className="text-base font-bold text-[#f0f2f8] mb-2 font-mono">// ABOUT {t.appTitle}</h3>
            <p className="text-xs text-[#8a8f9e] leading-relaxed mb-3">{t.aboutDesc}</p>
            <div className="text-xs text-[#a0a5b5] font-mono space-y-1 mb-5 border-l-2 border-[#d8308f]/60 pl-3">
              {t.aboutDetails.map((detail, index) => (
                <div key={index}>• {detail}</div>
              ))}
            </div>
            <button onClick={() => setShowAbout(false)} className="w-full py-2 bg-[#2d1b28] hover:bg-[#3d2035] text-[#f48fb1] border border-[#d8308f]/60 font-bold text-xs rounded-lg cursor-pointer transition-colors uppercase tracking-wider">{t.close}</button>
          </div>
        </div>
      )}
    </div>
  );
};