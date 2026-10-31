import React, { useRef, useEffect, useState } from 'react';
import { useProjectStore, MediaClip } from '@/store/useProjectStore';
import { saveMediaToProjectPackage } from '@/utils/fileSystem';
import {
  Plus,
  FolderPlus,
  Trash2,
  Scissors,
  Edit3,
  Video,
  Play,
  Pause,
  Lock,
  Eye,
  Volume2,
  VolumeX,
  EyeOff,
  Unlock,
  ChevronRight,
  ChevronDown,
  Diamond,
  Copy,
  Check,
} from 'lucide-react';

interface ClipContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  trackId: string;
  clip: MediaClip | null;
}

interface LayerContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  trackId: string;
  trackName: string;
}

interface KeyframeContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  trackId: string;
  clipId: string;
  propId: string;
  kfTime: number;
  value: any;
  clipStartTime: number;
}

interface TimelineProps {
  currentProjectDirHandle?: FileSystemDirectoryHandle | null;
}

const getInterpolatedValue = (currentTime: number, kfArray: {time: number, value: any}[] | undefined, fallback: any) => {
  if (!kfArray || kfArray.length === 0) return fallback;
  if (kfArray.length === 1) return kfArray[0].value;

  let kfStart = kfArray[0];
  let kfEnd = kfArray[kfArray.length - 1];

  for (let i = 0; i < kfArray.length - 1; i++) {
    if (currentTime >= kfArray[i].time && currentTime <= kfArray[i + 1].time) {
      kfStart = kfArray[i];
      kfEnd = kfArray[i + 1];
      break;
    }
  }

  if (currentTime <= kfStart.time) return kfStart.value;
  if (currentTime >= kfEnd.time) return kfEnd.value;

  const duration = kfEnd.time - kfStart.time;
  const elapsed = currentTime - kfStart.time;
  const progress = elapsed / duration; 

  if (typeof kfStart.value === 'object' && kfStart.value !== null) {
    const result: any = {};
    for (const key in kfStart.value) {
      const startVal = kfStart.value[key] || 0;
      const endVal = kfEnd.value[key] || 0;
      result[key] = startVal + (endVal - startVal) * progress;
    }
    return result;
  }

  return kfStart.value + (kfEnd.value - kfStart.value) * progress;
};

export const Timeline: React.FC<TimelineProps> = ({ currentProjectDirHandle }) => {
  const store = useProjectStore();
  const {
    project,
    isPlaying,
    togglePlay,
    selectedClipId,
    setCurrentTime,
    setSelectedClip,
    addTrack,
    deleteTrack,
    renameTrack,
    toggleTrackVisibility,
    toggleTrackLock,
    toggleTrackMute,
    importMediaToTrack,
    splitClip,
    deleteClip,
    trimClip,
    moveClipToTrack,
    setClipKeyframe,
    removeClipKeyframe
  } = store;

  const [zoomScale, setZoomScale] = useState<number>(100);
  const timeToPx = zoomScale;

  const fps = project.fps || 60;
  const frameDuration = 1 / fps;
  const pxPerFrame = timeToPx / fps;

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const layerListContainerRef = useRef<HTMLDivElement | null>(null);

  const trackLineRef = useRef<HTMLDivElement | null>(null);
  const dragOffsetRef = useRef<number>(0);
  const hiddenFileInputRef = useRef<HTMLInputElement | null>(null);
  const [targetImportTrackId, setTargetImportTrackId] = useState<string>('');

  const [editingTrackId, setEditingTrackId] = useState<string | null>(null);
  const [editingTrackName, setEditingTrackName] = useState<string>('');

  const [expandedTracks, setExpandedTracks] = useState<Record<string, boolean>>({});
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  const toggleTrackExpand = (trackId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedTracks((prev) => ({ ...prev, [trackId]: !prev[trackId] }));
  };

  const toggleGroupExpand = (groupId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedGroups((prev) => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  const transformProperties: { id: string; label: string }[] = [
    { id: 'position', label: 'Position' },
    { id: 'scale', label: 'Scale' },
    { id: 'rotation', label: 'Rotation' },
    { id: 'opacity', label: 'Opacity' },
  ];

  const effectsProperties: { id: string; label: string }[] = [
    { id: 'saturation', label: 'Saturation' },
    { id: 'vibrance', label: 'Vibrance' },
    { id: 'curves', label: 'Curves (Contrast)' },
    { id: 'sharpen', label: 'Sharpen' },
    { id: 'fadedFilm', label: 'Faded Film' },
  ];

  const audioProperties: { id: string; label: string }[] = [
    { id: 'volume', label: 'Volume' },
  ];

  const [clipContextMenu, setClipContextMenu] = useState<ClipContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    trackId: '',
    clip: null,
  });

  const [layerContextMenu, setLayerContextMenu] = useState<LayerContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    trackId: '',
    trackName: '',
  });

  const [kfContextMenu, setKfContextMenu] = useState<KeyframeContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    trackId: '',
    clipId: '',
    propId: '',
    kfTime: 0,
    value: null,
    clipStartTime: 0,
  });

  const [copiedKfValue, setCopiedKfValue] = useState<{ propId: string; value: any } | null>(null);

  const maxTimelineDuration = Math.max(30, project.duration || 0, project.currentTime + 10);
  const totalSeconds = Math.ceil(maxTimelineDuration);
  const totalFrames = Math.ceil(maxTimelineDuration * fps);
  const timelineWidthPx = totalSeconds * timeToPx;

  const snapToFrame = (timeInSeconds: number): number => {
    const frameIndex = Math.round(timeInSeconds * fps);
    return Math.max(0, frameIndex / fps);
  };

  const handleTimelineScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (layerListContainerRef.current) {
      layerListContainerRef.current.scrollTop = e.currentTarget.scrollTop;
    }
  };

  const handleLayerListScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = e.currentTarget.scrollTop;
    }
  };

  useEffect(() => {
    if (isPlaying && scrollContainerRef.current) {
      const playheadPx = project.currentTime * timeToPx;
      const container = scrollContainerRef.current;
      const scrollLeft = container.scrollLeft;
      const containerWidth = container.clientWidth;

      if (playheadPx > scrollLeft + containerWidth - 100 || playheadPx < scrollLeft) {
        container.scrollTo({
          left: Math.max(0, playheadPx - 100),
          behavior: 'smooth',
        });
      }
    }
  }, [project.currentTime, isPlaying, timeToPx]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tagName = target?.tagName?.toUpperCase();
      if (
        tagName === 'INPUT' ||
        tagName === 'TEXTAREA' ||
        target?.isContentEditable
      ) {
        return;
      }

      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          useProjectStore.getState().setCurrentTime(
            snapToFrame(useProjectStore.getState().project.currentTime + frameDuration)
          );
          return;
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          useProjectStore.getState().setCurrentTime(
            snapToFrame(useProjectStore.getState().project.currentTime - frameDuration)
          );
          return;
        }
      }

      const isSpace =
        e.code === 'Space' ||
        e.key === ' ' ||
        e.keyCode === 32;

      if ((e.ctrlKey || e.metaKey) && isSpace) {
        e.preventDefault();
        e.stopPropagation();
        togglePlay();
        return;
      }

      if (isSpace && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        togglePlay();
        return;
      }

      if (e.key === 'Escape' || e.code === 'Escape') {
        setSelectedClip(null);
        setClipContextMenu((prev) => ({ ...prev, visible: false }));
        setLayerContextMenu((prev) => ({ ...prev, visible: false }));
        setKfContextMenu((prev) => ({ ...prev, visible: false }));
        setEditingTrackId(null);
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
      }

      if (e.ctrlKey || e.metaKey) {
        if (e.key === '=' || e.key === '+') {
          e.preventDefault();
          setZoomScale((prev) => Math.min(400, prev + 20));
        } else if (e.key === '-') {
          e.preventDefault();
          setZoomScale((prev) => Math.max(30, prev - 20));
        }
      }
    };

    const handleClickOutside = () => {
      setClipContextMenu((prev) => ({ ...prev, visible: false }));
      setLayerContextMenu((prev) => ({ ...prev, visible: false }));
      setKfContextMenu((prev) => ({ ...prev, visible: false }));
    };

    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('click', handleClickOutside);

    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('click', handleClickOutside);
    };
  }, [setSelectedClip, togglePlay, frameDuration]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0] && targetImportTrackId) {
      const file = e.target.files[0];

      if (currentProjectDirHandle) {
        try {
          const { fileUrl } = await saveMediaToProjectPackage(currentProjectDirHandle, file);
          const customFileWithSavedUrl = new File([file], file.name, { type: file.type });
          Object.defineProperty(customFileWithSavedUrl, 'savedUrl', {
            value: fileUrl,
            writable: false,
          });
          importMediaToTrack(targetImportTrackId, customFileWithSavedUrl);
        } catch (err) {
          importMediaToTrack(targetImportTrackId, file);
        }
      } else {
        importMediaToTrack(targetImportTrackId, file);
      }

      e.target.value = '';
    }
  };

  const triggerImportForTrack = (trackId: string) => {
    setTargetImportTrackId(trackId);
    if (hiddenFileInputRef.current) {
      hiddenFileInputRef.current.click();
    }
  };

  const getRawTimeFromClientX = (clientX: number): number => {
    if (!trackLineRef.current) return 0;
    const rect = trackLineRef.current.getBoundingClientRect();
    const offsetX = clientX - rect.left;
    return Math.max(0, offsetX / timeToPx);
  };

  const handlePlayheadPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (isPlaying) togglePlay();

    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);

    const updateTime = (clientX: number) => {
      const rawTime = getRawTimeFromClientX(clientX);
      setCurrentTime(snapToFrame(rawTime));
    };

    updateTime(e.clientX);

    const onPointerMove = (moveEvent: PointerEvent) => {
      updateTime(moveEvent.clientX);
    };

    const onPointerUp = (upEvent: PointerEvent) => {
      try {
        target.releasePointerCapture(upEvent.pointerId);
      } catch {}
      updateTime(upEvent.clientX);

      target.removeEventListener('pointermove', onPointerMove);
      target.removeEventListener('pointerup', onPointerUp);
    };

    target.addEventListener('pointermove', onPointerMove);
    target.addEventListener('pointerup', onPointerUp);
  };

  const handleClipContextMenu = (e: React.MouseEvent, trackId: string, clip: MediaClip) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedClip(clip.id);
    setLayerContextMenu((prev) => ({ ...prev, visible: false }));
    setKfContextMenu((prev) => ({ ...prev, visible: false }));
    setClipContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      trackId,
      clip,
    });
  };

  const handleLayerHeaderContextMenu = (e: React.MouseEvent, trackId: string, trackName: string) => {
    e.preventDefault();
    e.stopPropagation();
    setClipContextMenu((prev) => ({ ...prev, visible: false }));
    setKfContextMenu((prev) => ({ ...prev, visible: false }));
    setLayerContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      trackId,
      trackName,
    });
  };

  const handleKeyframeContextMenu = (
    e: React.MouseEvent,
    trackId: string,
    clipId: string,
    propId: string,
    kfTime: number,
    value: any,
    clipStartTime: number
  ) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedClip(clipId);
    setClipContextMenu((prev) => ({ ...prev, visible: false }));
    setLayerContextMenu((prev) => ({ ...prev, visible: false }));
    setKfContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      trackId,
      clipId,
      propId,
      kfTime,
      value,
      clipStartTime,
    });
  };

  const handleKeyframePointerDown = (
    e: React.PointerEvent<HTMLDivElement>,
    trackId: string,
    clip: MediaClip,
    propId: string,
    initialKfTime: number,
    kfValue: any
  ) => {
    e.stopPropagation();
    e.preventDefault();
    if (isPlaying) togglePlay();

    setSelectedClip(clip.id);
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);

    let currentLocalTime = initialKfTime;
    const initialFrame = Math.round(initialKfTime * fps);

    const onPointerMove = (moveEvent: PointerEvent) => {
      if (!trackLineRef.current) return;
      const rect = trackLineRef.current.getBoundingClientRect();
      const clickPx = moveEvent.clientX - rect.left;
      const absoluteTime = clickPx / timeToPx;
      const rawLocalTime = absoluteTime - clip.startTime;
      
      const clampedLocalTime = Math.max(0, Math.min(clip.duration, rawLocalTime));
      let targetFrame = Math.round(clampedLocalTime * fps);
      const curFrame = Math.round(currentLocalTime * fps);
      const maxFrame = Math.round(clip.duration * fps);

      // Ambil state store terbaru secara dinamis
      const liveProject = useProjectStore.getState().project;
      const liveTrack = liveProject.tracks.find(t => t.id === trackId);
      const liveClip = liveTrack?.clips.find(c => c.id === clip.id);
      
      // Kumpulkan frame keyframe lain untuk menghindari bentrok/overwrite
      const occupiedFrames = new Set<number>();
      if (liveClip && (liveClip as any).keyframes) {
        if (propId === 'position') {
          const xKfs = (liveClip as any).keyframes.x || [];
          const yKfs = (liveClip as any).keyframes.y || [];
          xKfs.forEach((kf: any) => {
            const f = Math.round(kf.time * fps);
            if (f !== initialFrame) occupiedFrames.add(f);
          });
          yKfs.forEach((kf: any) => {
            const f = Math.round(kf.time * fps);
            if (f !== initialFrame) occupiedFrames.add(f);
          });
        } else {
          const propKfs = (liveClip as any).keyframes[propId] || [];
          propKfs.forEach((kf: any) => {
            const f = Math.round(kf.time * fps);
            if (f !== initialFrame) occupiedFrames.add(f);
          });
        }
      }

      // --- LOGIKA BUMPING & DIRECTION AWARE (KIRI / KANAN) ---
      if (occupiedFrames.has(targetFrame)) {
        const dragDirection = targetFrame > curFrame ? 1 : (targetFrame < curFrame ? -1 : 1);
        let candidateFrame = targetFrame;

        while (candidateFrame >= 0 && candidateFrame <= maxFrame) {
          if (!occupiedFrames.has(candidateFrame)) break;
          candidateFrame += dragDirection;
        }

        if (candidateFrame < 0 || candidateFrame > maxFrame) {
          candidateFrame = targetFrame;
          const oppositeDirection = -dragDirection;
          while (candidateFrame >= 0 && candidateFrame <= maxFrame) {
            if (!occupiedFrames.has(candidateFrame)) break;
            candidateFrame += oppositeDirection;
          }
        }

        if (candidateFrame >= 0 && candidateFrame <= maxFrame && !occupiedFrames.has(candidateFrame)) {
          targetFrame = candidateFrame;
        } else {
          return;
        }
      }
      // -----------------------------------------------------

      const newSnappedLocalTime = snapToFrame(targetFrame / fps);

      if (newSnappedLocalTime !== currentLocalTime) {
        if (propId === 'position') {
          removeClipKeyframe(trackId, clip.id, 'x', currentLocalTime);
          removeClipKeyframe(trackId, clip.id, 'y', currentLocalTime);
          
          const curX = typeof kfValue === 'object' && kfValue.x !== undefined ? kfValue.x : (clip.x ?? 0);
          const curY = typeof kfValue === 'object' && kfValue.y !== undefined ? kfValue.y : (clip.y ?? 0);
          setClipKeyframe(trackId, clip.id, 'x', newSnappedLocalTime, curX);
          setClipKeyframe(trackId, clip.id, 'y', newSnappedLocalTime, curY);
        } else {
          removeClipKeyframe(trackId, clip.id, propId as any, currentLocalTime);
          setClipKeyframe(trackId, clip.id, propId as any, newSnappedLocalTime, kfValue);
        }
        currentLocalTime = newSnappedLocalTime;
      }
    };

    const onPointerUp = (upEvent: PointerEvent) => {
      try {
        target.releasePointerCapture(upEvent.pointerId);
      } catch {}
      target.removeEventListener('pointermove', onPointerMove);
      target.removeEventListener('pointerup', onPointerUp);
    };

    target.addEventListener('pointermove', onPointerMove);
    target.addEventListener('pointerup', onPointerUp);
  };

  const handleEditKfValue = () => {
    if (!kfContextMenu.visible) return;
    const currentVal = kfContextMenu.value;
    let displayVal = typeof currentVal === 'object' ? JSON.stringify(currentVal) : String(currentVal);
    const input = window.prompt(`Masukkan nilai baru untuk ${kfContextMenu.propId.toUpperCase()}:`, displayVal);
    
    if (input !== null) {
      try {
        let parsedVal: any;
        if (typeof currentVal === 'number') {
          parsedVal = Number(input);
          if (isNaN(parsedVal)) return;
        } else if (typeof currentVal === 'object') {
          parsedVal = JSON.parse(input);
        } else {
          parsedVal = input;
        }

        if (kfContextMenu.propId === 'position' && typeof parsedVal === 'object') {
          setClipKeyframe(kfContextMenu.trackId, kfContextMenu.clipId, 'x', kfContextMenu.kfTime, parsedVal.x ?? 0);
          setClipKeyframe(kfContextMenu.trackId, kfContextMenu.clipId, 'y', kfContextMenu.kfTime, parsedVal.y ?? 0);
        } else {
          setClipKeyframe(kfContextMenu.trackId, kfContextMenu.clipId, kfContextMenu.propId as any, kfContextMenu.kfTime, parsedVal);
        }
      } catch (err) {
        alert("Format nilai tidak valid!");
      }
    }
    setKfContextMenu(prev => ({ ...prev, visible: false }));
  };

  const handleDeleteKf = () => {
    if (!kfContextMenu.visible) return;
    if (kfContextMenu.propId === 'position') {
      removeClipKeyframe(kfContextMenu.trackId, kfContextMenu.clipId, 'x', kfContextMenu.kfTime);
      removeClipKeyframe(kfContextMenu.trackId, kfContextMenu.clipId, 'y', kfContextMenu.kfTime);
    } else {
      removeClipKeyframe(kfContextMenu.trackId, kfContextMenu.clipId, kfContextMenu.propId as any, kfContextMenu.kfTime);
    }
    setKfContextMenu(prev => ({ ...prev, visible: false }));
  };

  const handleSaveTrackName = (trackId: string) => {
    if (editingTrackName.trim() && renameTrack) {
      renameTrack(trackId, editingTrackName.trim());
    }
    setEditingTrackId(null);
  };

  const handleToggleKeyframe = (trackId: string, propKey: string) => {
    if (isPlaying) togglePlay(); 

    if (!selectedClipId) return;
    const track = project.tracks.find(t => t.id === trackId);
    if (!track) return;
    const clip = track.clips.find(c => c.id === selectedClipId);
    if (!clip) return;

    const localTime = project.currentTime - clip.startTime;
    
    if (localTime < 0 || localTime > clip.duration) {
      alert("Playhead (garis waktu) harus berada di atas media untuk menaruh keyframe!");
      return;
    }

    const currentFrame = Math.round(localTime * fps);
    const exactLocalTime = currentFrame / fps;

    if (propKey === 'position') {
      const currentKeyframes: any[] = (clip as any).keyframes?.['x'] || [];
      const existingIndex = currentKeyframes.findIndex((kf: any) => Math.round(kf.time * fps) === currentFrame);

      if (existingIndex >= 0) {
        removeClipKeyframe(trackId, clip.id, 'x', exactLocalTime);
        removeClipKeyframe(trackId, clip.id, 'y', exactLocalTime);
      } else {
        const currentX = getInterpolatedValue(exactLocalTime, (clip as any).keyframes?.['x'], clip.x ?? 0);
        const currentY = getInterpolatedValue(exactLocalTime, (clip as any).keyframes?.['y'], clip.y ?? 0);
        
        setClipKeyframe(trackId, clip.id, 'x', exactLocalTime, currentX);
        setClipKeyframe(trackId, clip.id, 'y', exactLocalTime, currentY);
      }
    } else {
      const currentKeyframes: any[] = (clip as any).keyframes?.[propKey] || [];
      const existingIndex = currentKeyframes.findIndex((kf: any) => Math.round(kf.time * fps) === currentFrame);

      if (existingIndex >= 0) {
        removeClipKeyframe(trackId, clip.id, propKey as any, exactLocalTime);
      } else {
        let fallbackVal = (clip as any)[propKey];
        if (fallbackVal === undefined) {
          if (propKey === 'scale') fallbackVal = 1;
          else if (propKey === 'opacity' || propKey === 'volume') fallbackVal = 100;
          else if (propKey === 'rotation') fallbackVal = {x: 0, y: 0, z: 0};
          else if (propKey === 'saturation') fallbackVal = 100;
          else fallbackVal = 0; // vibrance, curves, sharpen, fadedFilm
        }
        
        const currentVal = getInterpolatedValue(exactLocalTime, (clip as any).keyframes?.[propKey], fallbackVal);
        setClipKeyframe(trackId, clip.id, propKey as any, exactLocalTime, currentVal);
      }
    }
  };

  const sortedTracks = [...project.tracks];
  const frameStep = pxPerFrame < 3 ? (pxPerFrame < 1.5 ? 10 : 5) : 1;

  const activeContextMenuTrack = project.tracks.find((t) => t.id === layerContextMenu.trackId);

  return (
    <div className="w-full h-full flex flex-col bg-[#0c0d10] border-t border-[#d8308f]/30 font-['USSO','Inter',sans-serif] text-xs select-none overflow-hidden">
      
      <input
        ref={hiddenFileInputRef}
        type="file"
        accept="*/*"
        className="hidden"
        onChange={handleFileUpload}
      />

      <div className="flex items-center justify-between px-3 py-2 border-b border-[#1f222e] bg-[#13151c] shrink-0">
        <div className="flex items-center gap-2">
          <span className="font-bold text-[#e571b6] tracking-wider uppercase text-xs">
            PROJECT : {project.name || 'Untitled Sequence'}
          </span>
          <span className="text-[#8a8f9e] font-mono text-[10px]">
            ({project.width}x{project.height} // {fps} FPS)
          </span>
        </div>

        <div className="flex items-center gap-2 bg-[#181a24] px-3 py-1 rounded-lg border border-[#d8308f]/30">
          <input
            type="range"
            min="30"
            max="400"
            value={zoomScale}
            onChange={(e) => setZoomScale(Number(e.target.value))}
            className="w-24 sm:w-36 h-1.5 bg-[#0c0d10] rounded-lg appearance-none cursor-pointer accent-[#d8308f]"
          />
          <span className="text-[#8a8f9e] text-[10px] w-12 font-mono font-bold text-right">
            {Math.round(zoomScale)}px/s
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[#1f222e] bg-[#0f1117] shrink-0 relative">
        <button
          onClick={() => addTrack('video')}
          className="px-2.5 py-1 rounded bg-[#181a24] hover:bg-[#222533] text-[#e0e2e8] border border-[#d8308f]/40 text-[11px] font-bold uppercase tracking-wider transition-colors cursor-pointer flex items-center gap-1.5"
        >
          <Plus className="w-3.5 h-3.5 text-[#f48fb1]" />
          <span>ADD LAYER</span>
        </button>

        <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2">
          <button
            onClick={togglePlay}
            className="px-3 py-1 rounded-lg bg-[#2a1826] hover:bg-[#3d1f38] text-[#f48fb1] border border-[#d8308f]/60 font-bold text-xs cursor-pointer transition-colors flex items-center gap-1.5 shadow-sm"
          >
            {isPlaying ? (
              <Pause className="w-3.5 h-3.5 text-[#f48fb1] fill-current" />
            ) : (
              <Play className="w-3.5 h-3.5 text-[#f48fb1] fill-current" />
            )}
            <span>{isPlaying ? 'PAUSE' : 'PLAY'}</span>
          </button>
        </div>

        <div className="flex items-center gap-2 bg-[#181a24] px-3 py-1 rounded-lg border border-[#1f222e]">
          <span className="text-[#6e7382] font-mono text-[10px]">FRAME:</span>
          <span className="text-[#e571b6] font-mono font-bold text-[11px]">
            {Math.round(project.currentTime * fps)} / {project.currentTime.toFixed(3)}s
          </span>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden p-2.5 sm:p-3 relative bg-[#0c0d10]">
        
        <div 
          ref={layerListContainerRef}
          onScroll={handleLayerListScroll}
          className="w-44 shrink-0 flex flex-col gap-[7px] z-20 pr-2 bg-[#0c0d10] border-r border-[#1f222e] overflow-y-hidden hover:overflow-y-auto no-scrollbar"
        >
          <div className="h-8 px-2 bg-[#13151c] border border-[#d8308f]/30 rounded-lg flex items-center justify-between text-[10px] font-mono font-bold text-[#8a8f9e] shrink-0 sticky top-0 z-30">
            <span>TIME CODE</span>
            <span className="text-[9px] text-[#6e7382]">1f={pxPerFrame.toFixed(1)}px</span>
          </div>

          {sortedTracks.map((track, index) => {
            const activeClipInTrack = track.clips.find(c => c.id === selectedClipId);

            return (
              <div key={`header_${track.id}`} className="flex flex-col shrink-0">
                
                <div
                  onContextMenu={(e) => handleLayerHeaderContextMenu(e, track.id, track.name || `Layer ${index + 1}`)}
                  className={`h-16 px-2 rounded-xl bg-[#13151c] border transition-colors cursor-context-menu flex flex-col justify-center shrink-0 ${
                    track.visible === false ? 'border-[#d8308f]/20 opacity-50' : 'border-[#d8308f]/30 hover:border-[#d8308f]/60'
                  }`}
                >
                  {editingTrackId === track.id ? (
                    <input
                      type="text"
                      autoFocus
                      value={editingTrackName}
                      onChange={(e) => setEditingTrackName(e.target.value)}
                      onBlur={() => handleSaveTrackName(track.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveTrackName(track.id);
                        else if (e.key === 'Escape') setEditingTrackId(null);
                      }}
                      className="w-full bg-[#181a24] border border-[#d8308f] rounded px-1.5 py-1 text-xs text-[#e0e2e8] outline-none font-bold"
                    />
                  ) : (
                    <div className="flex flex-col gap-1 overflow-hidden w-full">
                      <div className="flex items-center">
                        <button 
                          onClick={(e) => toggleTrackExpand(track.id, e)}
                          className="p-0.5 hover:bg-[#271324] rounded transition-colors mr-1 cursor-pointer"
                        >
                          {expandedTracks[track.id] ? (
                            <ChevronDown className="w-3.5 h-3.5 text-[#f48fb1]" />
                          ) : (
                            <ChevronRight className="w-3.5 h-3.5 text-[#8a8f9e]" />
                          )}
                        </button>
                        <span
                          title="Double-click or Right-click to edit"
                          onDoubleClick={() => {
                            setEditingTrackId(track.id);
                            setEditingTrackName(track.name || `Layer ${index + 1}`);
                          }}
                          className="font-bold text-[#e0e2e8] truncate text-[11px] cursor-pointer hover:text-[#f48fb1] flex-1"
                        >
                          {track.name || `Layer ${index + 1}`}
                        </span>
                        {track.visible === false && (
                          <span title="Hidden">
                            <EyeOff className="w-3 h-3 text-[#f48fb1] shrink-0 ml-1" />
                          </span>
                        )}
                      </div>
                      <span className="text-[9px] text-[#6e7382] font-mono pl-6">
                        Right-click options
                      </span>
                    </div>
                  )}
                </div>

                {expandedTracks[track.id] && (
                  <div className="flex flex-col mt-[7px] bg-[#0c0d10] pr-1">
                    
                    {/* TRANSFORM GROUP */}
                    <div 
                      onClick={(e) => toggleGroupExpand(`${track.id}_transform`, e)} 
                      className="h-7 flex items-center pl-3 hover:bg-[#1f222e] cursor-pointer rounded-md transition-colors"
                    >
                      {expandedGroups[`${track.id}_transform`] ? <ChevronDown className="w-3 h-3 text-[#e0e2e8] mr-1.5" /> : <ChevronRight className="w-3 h-3 text-[#8a8f9e] mr-1.5" />}
                      <span className="text-[10px] text-[#e0e2e8] font-bold">Transform</span>
                    </div>
                    
                    {expandedGroups[`${track.id}_transform`] && transformProperties.map(prop => {
                      let hasKeyframeNow = false;
                      let isPlayheadOverClip = false;

                      if (activeClipInTrack) {
                        const localTime = project.currentTime - activeClipInTrack.startTime;
                        const currentFrame = Math.round(localTime * fps);
                        isPlayheadOverClip = localTime >= 0 && localTime <= activeClipInTrack.duration;
                        
                        const checkPropKey = prop.id === 'position' ? 'x' : prop.id;
                        const kfs: any[] = (activeClipInTrack as any).keyframes?.[checkPropKey] || [];
                        hasKeyframeNow = kfs.some((kf: any) => Math.round(kf.time * fps) === currentFrame);
                      }

                      return (
                        <div key={`prop_${track.id}_${prop.id}`} className="h-7 flex items-center justify-between pl-8 pr-2 hover:bg-[#1f222e] group rounded-md transition-colors">
                          <span className="text-[9px] text-[#8a8f9e] group-hover:text-[#e0e2e8] font-mono">{prop.label}</span>
                          <button
                            disabled={!activeClipInTrack || !isPlayheadOverClip}
                            onClick={() => handleToggleKeyframe(track.id, prop.id)}
                            className={`p-1 rounded ${activeClipInTrack && isPlayheadOverClip ? 'cursor-pointer hover:bg-[#2d1b28]' : 'opacity-30 cursor-not-allowed'}`}
                          >
                            <Diamond className={`w-2.5 h-2.5 transition-colors ${hasKeyframeNow ? 'text-[#f48fb1] fill-[#f48fb1]' : 'text-[#6e7382] group-hover:text-[#f48fb1] fill-transparent'}`} />
                          </button>
                        </div>
                      );
                    })}

                    {/* EFFECTS GROUP */}
                    <div 
                      onClick={(e) => toggleGroupExpand(`${track.id}_effects`, e)} 
                      className="h-7 flex items-center pl-3 hover:bg-[#1f222e] cursor-pointer rounded-md transition-colors mt-0.5"
                    >
                      {expandedGroups[`${track.id}_effects`] ? <ChevronDown className="w-3 h-3 text-[#e0e2e8] mr-1.5" /> : <ChevronRight className="w-3 h-3 text-[#8a8f9e] mr-1.5" />}
                      <span className="text-[10px] text-[#e0e2e8] font-bold">Video Effects</span>
                    </div>
                    
                    {expandedGroups[`${track.id}_effects`] && effectsProperties.map(prop => {
                      let hasKeyframeNow = false;
                      let isPlayheadOverClip = false;

                      if (activeClipInTrack) {
                        const localTime = project.currentTime - activeClipInTrack.startTime;
                        const currentFrame = Math.round(localTime * fps);
                        isPlayheadOverClip = localTime >= 0 && localTime <= activeClipInTrack.duration;
                        
                        const kfs: any[] = (activeClipInTrack as any).keyframes?.[prop.id] || [];
                        hasKeyframeNow = kfs.some((kf: any) => Math.round(kf.time * fps) === currentFrame);
                      }

                      return (
                        <div key={`prop_${track.id}_${prop.id}`} className="h-7 flex items-center justify-between pl-8 pr-2 hover:bg-[#1f222e] group rounded-md transition-colors">
                          <span className="text-[9px] text-[#8a8f9e] group-hover:text-[#e0e2e8] font-mono">{prop.label}</span>
                          <button
                            disabled={!activeClipInTrack || !isPlayheadOverClip}
                            onClick={() => handleToggleKeyframe(track.id, prop.id)}
                            className={`p-1 rounded ${activeClipInTrack && isPlayheadOverClip ? 'cursor-pointer hover:bg-[#2d1b28]' : 'opacity-30 cursor-not-allowed'}`}
                          >
                            <Diamond className={`w-2.5 h-2.5 transition-colors ${hasKeyframeNow ? 'text-[#f48fb1] fill-[#f48fb1]' : 'text-[#6e7382] group-hover:text-[#f48fb1] fill-transparent'}`} />
                          </button>
                        </div>
                      );
                    })}

                    {/* AUDIO GROUP */}
                    <div 
                      onClick={(e) => toggleGroupExpand(`${track.id}_audio`, e)} 
                      className="h-7 flex items-center pl-3 hover:bg-[#1f222e] cursor-pointer rounded-md transition-colors mt-0.5"
                    >
                      {expandedGroups[`${track.id}_audio`] ? <ChevronDown className="w-3 h-3 text-[#e0e2e8] mr-1.5" /> : <ChevronRight className="w-3 h-3 text-[#8a8f9e] mr-1.5" />}
                      <span className="text-[10px] text-[#e0e2e8] font-bold">Audio</span>
                    </div>
                    
                    {expandedGroups[`${track.id}_audio`] && audioProperties.map(prop => {
                      let hasKeyframeNow = false;
                      let isPlayheadOverClip = false;

                      if (activeClipInTrack) {
                        const localTime = project.currentTime - activeClipInTrack.startTime;
                        const currentFrame = Math.round(localTime * fps);
                        isPlayheadOverClip = localTime >= 0 && localTime <= activeClipInTrack.duration;
                        
                        const kfs: any[] = (activeClipInTrack as any).keyframes?.[prop.id] || [];
                        hasKeyframeNow = kfs.some((kf: any) => Math.round(kf.time * fps) === currentFrame);
                      }

                      return (
                        <div key={`prop_${track.id}_${prop.id}`} className="h-7 flex items-center justify-between pl-8 pr-2 hover:bg-[#1f222e] group rounded-md transition-colors">
                          <span className="text-[9px] text-[#8a8f9e] group-hover:text-[#e0e2e8] font-mono">{prop.label}</span>
                          <button
                            disabled={!activeClipInTrack || !isPlayheadOverClip}
                            onClick={() => handleToggleKeyframe(track.id, prop.id)}
                            className={`p-1 rounded ${activeClipInTrack && isPlayheadOverClip ? 'cursor-pointer hover:bg-[#2d1b28]' : 'opacity-30 cursor-not-allowed'}`}
                          >
                            <Diamond className={`w-2.5 h-2.5 transition-colors ${hasKeyframeNow ? 'text-[#f48fb1] fill-[#f48fb1]' : 'text-[#6e7382] group-hover:text-[#f48fb1] fill-transparent'}`} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
          
          <div className="h-6 shrink-0" />
        </div>

        <div
          ref={scrollContainerRef}
          onScroll={handleTimelineScroll}
          className="flex-1 overflow-x-auto overflow-y-auto pl-2 relative"
        >
          <div
            ref={trackLineRef}
            className="relative flex flex-col gap-[7px]"
            style={{ width: `${timelineWidthPx}px` }}
          >
            <div
              onPointerDown={handlePlayheadPointerDown}
              className="absolute top-0 bottom-0 w-[1px] bg-[#d8308f] hover:bg-[#f48fb1] z-40 cursor-ew-resize touch-none pointer-events-none"
              style={{ left: `${project.currentTime * timeToPx}px` }}
            >
              <div className="w-2.5 h-2.5 bg-[#d8308f] border border-[#0c0d10] -ml-[4px] -top-1 absolute rotate-45 cursor-ew-resize pointer-events-auto" />
            </div>

            <div
              onPointerDown={handlePlayheadPointerDown}
              className="h-8 bg-[#13151c] border border-[#d8308f]/30 rounded-lg relative cursor-pointer overflow-hidden touch-none shrink-0 font-mono sticky top-0 z-30"
            >
              {Array.from({ length: totalSeconds }).map((_, sec) => (
                <div
                  key={`sec-label-${sec}`}
                  className="absolute top-1 text-[9px] font-bold text-[#8a8f9e] leading-none pl-1 pointer-events-none"
                  style={{ left: `${sec * timeToPx}px` }}
                >
                  {sec}s
                </div>
              ))}

              {Array.from({ length: Math.ceil(totalFrames / frameStep) }).map((_, idx) => {
                const frameIdx = idx * frameStep;
                const isSecondMark = frameIdx % fps === 0;
                const isHalfSecondMark = frameIdx % Math.floor(fps / 2) === 0 && !isSecondMark;
                const posX = frameIdx * pxPerFrame;

                return (
                  <div
                    key={`frame-tick-${frameIdx}`}
                    className={`absolute bottom-0 w-[1px] pointer-events-none ${
                      isSecondMark
                        ? 'h-3.5 bg-[#8a8f9e]'
                        : isHalfSecondMark
                        ? 'h-2.5 bg-[#404554]'
                        : 'h-1.5 bg-[#222530]'
                    }`}
                    style={{ left: `${posX}px` }}
                  />
                );
              })}
            </div>

            {sortedTracks.map((track) => (
              <div key={`lane_${track.id}`} className="flex flex-col shrink-0">
                
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (isPlaying) togglePlay(); 
                    const fromTrackId = e.dataTransfer.getData('fromTrackId');
                    const clipId = e.dataTransfer.getData('clipId');
                    if (fromTrackId && clipId && trackLineRef.current) {
                      const rect = trackLineRef.current.getBoundingClientRect();
                      const dropX = e.clientX - rect.left - dragOffsetRef.current;
                      const dropTime = snapToFrame(Math.max(0, dropX / timeToPx));
                      moveClipToTrack(fromTrackId, track.id, clipId, dropTime);
                    }
                  }}
                  className={`h-16 bg-[#13151c]/60 rounded-xl border border-[#1f222e] relative overflow-hidden cursor-pointer shrink-0 transition-opacity ${
                    track.visible === false ? 'opacity-30' : ''
                  }`}
                  onClick={(e) => {
                    const rawTime = getRawTimeFromClientX(e.clientX);
                    setCurrentTime(snapToFrame(rawTime));
                  }}
                >
                  {track.clips.map((clip) => {
                    const isSelected = selectedClipId === clip.id;

                    return (
                      <div
                        key={clip.id}
                        draggable={!track.locked}
                        onDragStart={(e) => {
                          if (isPlaying) togglePlay(); 
                          e.dataTransfer.setData('fromTrackId', track.id);
                          e.dataTransfer.setData('clipId', clip.id);
                          const clipRect = e.currentTarget.getBoundingClientRect();
                          dragOffsetRef.current = e.clientX - clipRect.left;
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedClip(clip.id);
                        }}
                        onContextMenu={(e) => handleClipContextMenu(e, track.id, clip)}
                        className={`absolute top-1 bottom-1 rounded-lg border flex items-center justify-between px-2 transition-colors ${
                          track.locked ? 'cursor-not-allowed opacity-60' : 'cursor-grab active:cursor-grabbing'
                        } ${
                          isSelected
                            ? 'bg-[#211624] border-[#d8308f] z-20 shadow-sm'
                            : clip.type === 'video'
                            ? 'bg-[#161a28] border-[#2e3752] hover:border-[#d8308f]/50 z-10'
                            : 'bg-[#1d1626] border-[#422a4d] hover:border-[#d8308f]/50 z-10'
                        }`}
                        style={{
                          left: `${clip.startTime * timeToPx}px`,
                          width: `${clip.duration * timeToPx}px`,
                        }}
                      >
                        {!track.locked && (
                          <div
                            className="w-2.5 h-full bg-[#383d4d]/50 hover:bg-[#d8308f] absolute left-0 top-0 cursor-ew-resize rounded-l-lg z-30 touch-none"
                            onMouseDown={(e) => {
                              e.preventDefault(); 
                              e.stopPropagation();
                              if (isPlaying) togglePlay(); 
                              
                              const startX = e.clientX;
                              const initStart = clip.startTime;
                              const initDuration = clip.duration;

                              const onMouseMove = (moveEvent: MouseEvent) => {
                                const deltaSec = (moveEvent.clientX - startX) / timeToPx;
                                const snappedStart = snapToFrame(initStart + deltaSec);
                                const snappedDuration = snapToFrame(initDuration - (snappedStart - initStart));
                                trimClip(track.id, clip.id, snappedStart, snappedDuration);
                              };

                              const onMouseUp = () => {
                                window.removeEventListener('mousemove', onMouseMove);
                                window.removeEventListener('mouseup', onMouseUp);
                              };

                              window.addEventListener('mousemove', onMouseMove);
                              window.addEventListener('mouseup', onMouseUp);
                            }}
                          />
                        )}

                        <div className="flex items-center gap-1.5 overflow-hidden mx-1.5 pointer-events-none">
                          <Video className="w-3 h-3 text-[#f48fb1] shrink-0" />
                          <span className="text-[9px] font-mono font-bold px-1 rounded bg-[#0c0d10]/80 text-[#8a8f9e] uppercase">
                            {clip.type}
                          </span>
                          <span className="text-[10px] font-medium text-[#e0e2e8] truncate">
                            {clip.name} ({clip.duration.toFixed(2)}s)
                          </span>
                        </div>

                        {!track.locked && (
                          <div
                            className="w-2.5 h-full bg-[#383d4d]/50 hover:bg-[#d8308f] absolute right-0 top-0 cursor-ew-resize rounded-r-lg z-30 touch-none"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              if (isPlaying) togglePlay(); 
                              
                              const startX = e.clientX;
                              const initDuration = clip.duration;

                              const onMouseMove = (moveEvent: MouseEvent) => {
                                const deltaSec = (moveEvent.clientX - startX) / timeToPx;
                                const snappedDuration = snapToFrame(initDuration + deltaSec);
                                trimClip(track.id, clip.id, clip.startTime, snappedDuration);
                              };

                              const onMouseUp = () => {
                                window.removeEventListener('mousemove', onMouseMove);
                                window.removeEventListener('mouseup', onMouseUp);
                              };

                              window.addEventListener('mousemove', onMouseMove);
                              window.addEventListener('mouseup', onMouseUp);
                            }}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>

                {expandedTracks[track.id] && (
                  <div className="flex flex-col mt-[7px] pointer-events-none">
                    
                    {/* TRANSFORM KEYFRAME LANES */}
                    <div className="h-7 border-b border-[#2f3342]/20 bg-[#13151c]/30 rounded-md" />
                    {expandedGroups[`${track.id}_transform`] && transformProperties.map(prop => {
                      return (
                        <div key={`kf_grid_${track.id}_${prop.id}`} className="h-7 border-b border-[#2f3342]/10 bg-[#0f1117]/50 relative rounded-md pointer-events-auto">
                          
                          {track.clips.map(clip => {
                            const targetPropKey = prop.id === 'position' ? 'x' : prop.id;
                            const keyframesArray: any[] = (clip as any).keyframes?.[targetPropKey] || [];
                            
                            return keyframesArray.map((kf: any, i: number) => {
                              const absoluteTime = clip.startTime + kf.time;
                              const absolutePx = absoluteTime * timeToPx;
                              
                              let kfValueToPass = kf.value;
                              if (prop.id === 'position') {
                                const yKfs: any[] = (clip as any).keyframes?.['y'] || [];
                                const yKf = yKfs.find((yk: any) => Math.round(yk.time * fps) === Math.round(kf.time * fps));
                                kfValueToPass = { x: kf.value, y: yKf ? yKf.value : (clip.y ?? 0) };
                              }

                              return (
                                <div 
                                  key={`${clip.id}_${i}`} 
                                  onPointerDown={(e) => handleKeyframePointerDown(e, track.id, clip, prop.id, kf.time, kfValueToPass)}
                                  onContextMenu={(e) => handleKeyframeContextMenu(e, track.id, clip.id, prop.id, kf.time, kfValueToPass, clip.startTime)}
                                  className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-[#f48fb1] hover:bg-white rotate-45 ml-[-6px] shadow-[0_0_6px_#f48fb1] cursor-grab active:cursor-grabbing z-10 transition-colors touch-none" 
                                  style={{ left: `${absolutePx}px` }} 
                                  title={`${prop.label} (Seret untuk geser, Klik-Kanan opsi)`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setCurrentTime(snapToFrame(absoluteTime));
                                  }}
                                />
                              );
                            });
                          })}
                        
                        </div>
                      );
                    })}

                    {/* EFFECTS KEYFRAME LANES */}
                    <div className="h-7 border-b border-[#2f3342]/20 bg-[#13151c]/30 rounded-md mt-0.5" />
                    {expandedGroups[`${track.id}_effects`] && effectsProperties.map(prop => (
                      <div key={`kf_grid_${track.id}_${prop.id}`} className="h-7 border-b border-[#2f3342]/10 bg-[#0f1117]/50 relative rounded-md pointer-events-auto">
                          {track.clips.map(clip => {
                            const keyframesArray: any[] = (clip as any).keyframes?.[prop.id] || [];
                            
                            return keyframesArray.map((kf: any, i: number) => {
                              const absoluteTime = clip.startTime + kf.time;
                              const absolutePx = absoluteTime * timeToPx;
                              
                              return (
                                <div 
                                  key={`${clip.id}_${i}`} 
                                  onPointerDown={(e) => handleKeyframePointerDown(e, track.id, clip, prop.id, kf.time, kf.value)}
                                  onContextMenu={(e) => handleKeyframeContextMenu(e, track.id, clip.id, prop.id, kf.time, kf.value, clip.startTime)}
                                  className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-[#38bdf8] hover:bg-white rotate-45 ml-[-6px] shadow-[0_0_6px_#38bdf8] cursor-grab active:cursor-grabbing z-10 transition-colors touch-none" 
                                  style={{ left: `${absolutePx}px` }} 
                                  title={`${prop.label}: ${kf.value} (Seret untuk geser, Klik-Kanan opsi)`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setCurrentTime(snapToFrame(absoluteTime));
                                  }}
                                />
                              );
                            });
                          })}
                      </div>
                    ))}

                    {/* AUDIO KEYFRAME LANES */}
                    <div className="h-7 border-b border-[#2f3342]/20 bg-[#13151c]/30 rounded-md mt-0.5" />
                    {expandedGroups[`${track.id}_audio`] && audioProperties.map(prop => (
                      <div key={`kf_grid_${track.id}_${prop.id}`} className="h-7 border-b border-[#2f3342]/10 bg-[#0f1117]/50 relative rounded-md pointer-events-auto">
                          {track.clips.map(clip => {
                            const keyframesArray: any[] = (clip as any).keyframes?.[prop.id] || [];
                            
                            return keyframesArray.map((kf: any, i: number) => {
                              const absoluteTime = clip.startTime + kf.time;
                              const absolutePx = absoluteTime * timeToPx;
                              
                              return (
                                <div 
                                  key={`${clip.id}_${i}`} 
                                  onPointerDown={(e) => handleKeyframePointerDown(e, track.id, clip, prop.id, kf.time, kf.value)}
                                  onContextMenu={(e) => handleKeyframeContextMenu(e, track.id, clip.id, prop.id, kf.time, kf.value, clip.startTime)}
                                  className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-[#50c878] hover:bg-white rotate-45 ml-[-6px] shadow-[0_0_6px_#50c878] cursor-grab active:cursor-grabbing z-10 transition-colors touch-none" 
                                  style={{ left: `${absolutePx}px` }} 
                                  title={`${prop.label}: ${kf.value} (Seret untuk geser, Klik-Kanan opsi)`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setCurrentTime(snapToFrame(absoluteTime));
                                  }}
                                />
                              );
                            });
                          })}
                      </div>
                    ))}

                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

      </div>

      {clipContextMenu.visible && clipContextMenu.clip && (
        <div
          className="fixed z-50 bg-[#13151c] border border-[#d8308f]/50 rounded-xl shadow-2xl py-1 text-xs min-w-[160px] font-mono text-[#e0e2e8]"
          style={{
            bottom: `${window.innerHeight - clipContextMenu.y}px`,
            left: `${clipContextMenu.x}px`,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-3 py-1.5 border-b border-[#1f222e] text-[10px] text-[#8a8f9e] font-bold truncate">
            {clipContextMenu.clip.name}
          </div>
          <button
            onClick={() => {
              if (isPlaying) togglePlay();
              if (clipContextMenu.clip) {
                splitClip(clipContextMenu.trackId, clipContextMenu.clip.id, project.currentTime);
              }
              setClipContextMenu((prev) => ({ ...prev, visible: false }));
            }}
            className="w-full text-left px-3 py-2 hover:bg-[#271324] hover:text-[#f48fb1] flex items-center gap-2 cursor-pointer"
          >
            <Scissors className="w-3.5 h-3.5 text-[#f48fb1]" />
            <span>SPLIT AT PLAYHEAD</span>
          </button>
          <button
            onClick={() => {
              if (isPlaying) togglePlay(); 
              if (clipContextMenu.clip) {
                deleteClip(clipContextMenu.trackId, clipContextMenu.clip.id);
              }
              setClipContextMenu((prev) => ({ ...prev, visible: false }));
            }}
            className="w-full text-left px-3 py-2 hover:bg-[#3d1825] text-[#f48fb1] flex items-center gap-2 cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5 text-[#f48fb1]" />
            <span>DELETE CLIP</span>
          </button>
        </div>
      )}

      {layerContextMenu.visible && activeContextMenuTrack && (
        <div
          className="fixed z-50 bg-[#13151c] border border-[#d8308f]/50 rounded-xl shadow-2xl p-1 text-xs min-w-[180px] font-mono text-[#e0e2e8]"
          style={{
            bottom: `${window.innerHeight - layerContextMenu.y}px`,
            left: `${layerContextMenu.x}px`,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-around bg-[#181a24] p-1.5 rounded-lg border border-[#2f3342] mb-1">
            <button
              title="Preview / Play Layer"
              onClick={() => store.togglePlay()}
              className="p-1.5 rounded hover:bg-[#271324] text-[#e0e2e8] hover:text-[#f48fb1] transition-colors cursor-pointer"
            >
              <Play className="w-4 h-4 fill-current" />
            </button>

            <button
              title={activeContextMenuTrack.locked ? 'Unlock Layer' : 'Lock Layer'}
              onClick={() => toggleTrackLock(layerContextMenu.trackId)}
              className={`p-1.5 rounded hover:bg-[#271324] transition-colors cursor-pointer ${
                activeContextMenuTrack.locked ? 'text-[#f48fb1] bg-[#2d1b28]' : 'text-[#e0e2e8]'
              }`}
            >
              {activeContextMenuTrack.locked ? (
                <Lock className="w-4 h-4" />
              ) : (
                <Unlock className="w-4 h-4" />
              )}
            </button>

            <button
              title={activeContextMenuTrack.visible === false ? 'Show Layer' : 'Hide Layer'}
              onClick={() => toggleTrackVisibility(layerContextMenu.trackId)}
              className={`p-1.5 rounded hover:bg-[#271324] transition-colors cursor-pointer ${
                activeContextMenuTrack.visible === false ? 'text-[#f48fb1] bg-[#2d1b28]' : 'text-[#e0e2e8]'
              }`}
            >
              {activeContextMenuTrack.visible === false ? (
                <EyeOff className="w-4 h-4" />
              ) : (
                <Eye className="w-4 h-4" />
              )}
            </button>

            <button
              title={activeContextMenuTrack.muted ? 'Unmute Audio' : 'Mute Audio'}
              onClick={() => toggleTrackMute(layerContextMenu.trackId)}
              className={`p-1.5 rounded hover:bg-[#271324] transition-colors cursor-pointer ${
                activeContextMenuTrack.muted ? 'text-[#f48fb1] bg-[#2d1b28]' : 'text-[#e0e2e8]'
              }`}
            >
              {activeContextMenuTrack.muted ? (
                <VolumeX className="w-4 h-4" />
              ) : (
                <Volume2 className="w-4 h-4" />
              )}
            </button>
          </div>

          <div className="px-2 py-1 border-b border-[#1f222e] text-[10px] text-[#8a8f9e] font-bold truncate">
            LAYER: {layerContextMenu.trackName}
          </div>

          <button
            onClick={() => {
              setEditingTrackId(layerContextMenu.trackId);
              setEditingTrackName(layerContextMenu.trackName);
              setLayerContextMenu((prev) => ({ ...prev, visible: false }));
            }}
            className="w-full text-left px-3 py-2 hover:bg-[#271324] hover:text-[#f48fb1] flex items-center gap-2 cursor-pointer rounded mt-0.5"
          >
            <Edit3 className="w-3.5 h-3.5 text-[#f48fb1]" />
            <span>RENAME LAYER</span>
          </button>

          <button
            onClick={() => {
              triggerImportForTrack(layerContextMenu.trackId);
              setLayerContextMenu((prev) => ({ ...prev, visible: false }));
            }}
            className="w-full text-left px-3 py-2 hover:bg-[#271324] hover:text-[#f48fb1] flex items-center gap-2 cursor-pointer rounded"
          >
            <FolderPlus className="w-3.5 h-3.5 text-[#f48fb1]" />
            <span>IMPORT MEDIA</span>
          </button>

          <button
            onClick={() => {
              deleteTrack(layerContextMenu.trackId);
              setLayerContextMenu((prev) => ({ ...prev, visible: false }));
            }}
            className="w-full text-left px-3 py-2 hover:bg-[#3d1825] text-[#f48fb1] flex items-center gap-2 cursor-pointer border-t border-[#1f222e] rounded-b mt-0.5"
          >
            <Trash2 className="w-3.5 h-3.5 text-[#f48fb1]" />
            <span>DELETE LAYER</span>
          </button>
        </div>
      )}

      {kfContextMenu.visible && (
        <div
          className="fixed z-50 bg-[#13151c] border border-[#d8308f]/50 rounded-xl shadow-2xl p-1 text-xs min-w-[170px] font-mono text-[#e0e2e8]"
          style={{
            bottom: `${window.innerHeight - kfContextMenu.y}px`,
            left: `${kfContextMenu.x}px`,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-3 py-1.5 border-b border-[#1f222e] text-[10px] text-[#8a8f9e] font-bold truncate">
            KEYFRAME: {kfContextMenu.propId.toUpperCase()} ({kfContextMenu.kfTime.toFixed(2)}s)
          </div>

          <button
            onClick={() => {
              setCurrentTime(snapToFrame(kfContextMenu.clipStartTime + kfContextMenu.kfTime));
              setKfContextMenu((prev) => ({ ...prev, visible: false }));
            }}
            className="w-full text-left px-3 py-2 hover:bg-[#271324] hover:text-[#f48fb1] flex items-center gap-2 cursor-pointer rounded mt-0.5"
          >
            <Play className="w-3.5 h-3.5 text-[#f48fb1]" />
            <span>JUMP TO FRAME</span>
          </button>

          <button
            onClick={handleEditKfValue}
            className="w-full text-left px-3 py-2 hover:bg-[#271324] hover:text-[#f48fb1] flex items-center gap-2 cursor-pointer rounded"
          >
            <Edit3 className="w-3.5 h-3.5 text-[#f48fb1]" />
            <span>EDIT VALUE</span>
          </button>

          <button
            onClick={() => {
              setCopiedKfValue({ propId: kfContextMenu.propId, value: kfContextMenu.value });
              try {
                navigator.clipboard.writeText(
                  typeof kfContextMenu.value === 'object'
                    ? JSON.stringify(kfContextMenu.value)
                    : String(kfContextMenu.value)
                );
              } catch (e) {}
              setKfContextMenu((prev) => ({ ...prev, visible: false }));
            }}
            className="w-full text-left px-3 py-2 hover:bg-[#271324] hover:text-[#f48fb1] flex items-center gap-2 cursor-pointer rounded"
          >
            <Copy className="w-3.5 h-3.5 text-[#f48fb1]" />
            <span>COPY VALUE</span>
          </button>

          {copiedKfValue && copiedKfValue.propId === kfContextMenu.propId && (
            <button
              onClick={() => {
                if (kfContextMenu.propId === 'position' && typeof copiedKfValue.value === 'object') {
                  setClipKeyframe(kfContextMenu.trackId, kfContextMenu.clipId, 'x', kfContextMenu.kfTime, copiedKfValue.value.x ?? 0);
                  setClipKeyframe(kfContextMenu.trackId, kfContextMenu.clipId, 'y', kfContextMenu.kfTime, copiedKfValue.value.y ?? 0);
                } else {
                  setClipKeyframe(
                    kfContextMenu.trackId,
                    kfContextMenu.clipId,
                    kfContextMenu.propId as any,
                    kfContextMenu.kfTime,
                    copiedKfValue.value
                  );
                }
                setKfContextMenu((prev) => ({ ...prev, visible: false }));
              }}
              className="w-full text-left px-3 py-2 hover:bg-[#271324] hover:text-[#f48fb1] flex items-center gap-2 cursor-pointer rounded"
            >
              <Check className="w-3.5 h-3.5 text-green-400" />
              <span>PASTE VALUE</span>
            </button>
          )}

          <button
            onClick={handleDeleteKf}
            className="w-full text-left px-3 py-2 hover:bg-[#3d1825] text-[#f48fb1] flex items-center gap-2 cursor-pointer border-t border-[#1f222e] rounded-b mt-0.5"
          >
            <Trash2 className="w-3.5 h-3.5 text-[#f48fb1]" />
            <span>DELETE KEYFRAME</span>
          </button>
        </div>
      )}
    </div>
  );
};