import { create } from 'zustand';
import { temporal } from 'zundo';
import { convertMediaFPS } from '@/utils/mediaConverter';

export interface KeyframeData {
  time: number;
  value: any; // Menggunakan 'any' untuk mendukung angka (scale/opacity) maupun objek {x,y,z} (rotation)
}

export interface ClipKeyframes {
  x?: KeyframeData[];
  y?: KeyframeData[];
  scale?: KeyframeData[];
  rotation?: KeyframeData[];
  opacity?: KeyframeData[];
  volume?: KeyframeData[]; 
  
  // -- Video Effects Keyframes --
  saturation?: KeyframeData[];
  vibrance?: KeyframeData[];
  curves?: KeyframeData[];
  sharpen?: KeyframeData[];
  fadedFilm?: KeyframeData[];

  // -- NEW: Color Grading / Coloring Keyframes --
  brightness?: KeyframeData[];
  contrast?: KeyframeData[];
  temperature?: KeyframeData[];
  tint?: KeyframeData[];
  highlights?: KeyframeData[];
  shadows?: KeyframeData[];
}

export interface MediaClip {
  id: string;
  type: 'video' | 'image' | 'gif' | 'audio';
  name: string;
  fileUrl: string;
  startTime: number;
  duration: number;
  sourceStart: number;
  sourceDuration?: number;
  fps?: number;
  
  // -- Transform Base Values --
  x?: number;      
  y?: number;      
  scale?: number;  
  rotation?: any; // Objek {x, y, z}
  opacity?: number;  
  volume?: number;  

  // -- Video Effects Base Values --
  saturation?: number;
  vibrance?: number;
  curves?: number;
  sharpen?: number;
  fadedFilm?: number;

  // -- NEW: Color Grading / Coloring Base Values --
  brightness?: number;   // Default misal: 0 atau 100
  contrast?: number;     // Default misal: 0 atau 100
  temperature?: number;  // Default misal: 0 (Keluaran Kelvin atau slider -50 s.d 50)
  tint?: number;         // Default misal: 0
  highlights?: number;   // Default misal: 0
  shadows?: number;      // Default misal: 0
  
  keyframes?: ClipKeyframes;
}

export interface TrackAudioSettings {
  volumeLeft: number;  // 0 - 100
  volumeRight: number; // 0 - 100
  muted: boolean;
  pitch: number;       
  eqLow: number;       
  eqMid: number;       
  eqHigh: number;      
}

export interface Track {
  id: string;
  name: string;
  order: number;
  muted: boolean;
  visible: boolean;
  locked?: boolean;
  audioSettings: TrackAudioSettings;
  clips: MediaClip[];
}

export interface Project {
  id: string;
  name: string;
  folderName?: string;
  width: number;
  height: number;
  fps: number;
  currentTime: number;
  duration: number;
  tracks: Track[];
}

export interface ProjectState {
  project: Project;
  selectedClipId: string | null;
  selectedTrackId: string | null;
  isPlaying: boolean;
  
  createNewProject: (name: string, width: number, height: number, fps: number) => void;
  setCurrentTime: (time: number) => void;
  setSelectedClip: (clipId: string | null) => void;
  setSelectedTrack: (trackId: string | null) => void;
  setIsPlaying: (isPlaying: boolean) => void;
  togglePlay: () => void;
  
  addTrack: (type?: string) => void;
  deleteTrack: (trackId: string) => void;
  renameTrack: (trackId: string, newName: string) => void;
  toggleTrackVisibility: (trackId: string) => void;
  toggleTrackLock: (trackId: string) => void;
  toggleTrackMute: (trackId: string) => void;
  updateTrackAudioSettings: (trackId: string, settings: Partial<TrackAudioSettings>) => void;
  
  addClipToTrack: (trackId: string, clip: MediaClip) => void;
  importMediaToTrack: (trackId: string, file: File) => Promise<void>;
  splitClip: (trackId: string, clipId: string, splitTime: number) => void;
  deleteClip: (trackId: string, clipId: string) => void;
  trimClip: (trackId: string, clipId: string, newStart: number, newDuration: number) => void;
  moveClipToTrack: (fromTrackId: string, toTrackId: string, clipId: string, newStartTime?: number) => void;
  updateClipTransform: (
    trackId: string, 
    clipId: string, 
    transform: { 
      x?: number; 
      y?: number; 
      scale?: number; 
      rotation?: any; 
      opacity?: number; 
      volume?: number;
      saturation?: number;
      vibrance?: number;
      curves?: number;
      sharpen?: number;
      fadedFilm?: number;
      // -- NEW: Coloring Parameters in Transform/Update --
      brightness?: number;
      contrast?: number;
      temperature?: number;
      tint?: number;
      highlights?: number;
      shadows?: number;
    }
  ) => void;
  setProjectDuration: (duration: number) => void;

  setClipKeyframe: (trackId: string, clipId: string, property: keyof ClipKeyframes, time: number, value: any) => void;
  removeClipKeyframe: (trackId: string, clipId: string, property: keyof ClipKeyframes, time: number) => void;
}

const defaultAudioSettings: TrackAudioSettings = {
  volumeLeft: 100,
  volumeRight: 100,
  muted: false,
  pitch: 0,
  eqLow: 0,
  eqMid: 0,
  eqHigh: 0,
};

export const useProjectStore = create<ProjectState>()(
  temporal(
    (set, get) => ({
      project: {
        id: 'proj-1',
        name: 'Untitled Sequence',
        folderName: 'untitled_sequence',
        width: 1920,
        height: 1080,
        fps: 60,
        currentTime: 0,
        duration: 30,
        tracks: [
          { id: 'track-1', name: 'Layer 1', order: 0, muted: false, visible: true, locked: false, audioSettings: { ...defaultAudioSettings }, clips: [] },
          { id: 'track-2', name: 'Layer 2', order: 1, muted: false, visible: true, locked: false, audioSettings: { ...defaultAudioSettings }, clips: [] },
        ],
      },
      selectedClipId: null,
      selectedTrackId: 'track-1',
      isPlaying: false,

      createNewProject: (name, width, height, fps) => {
        const sanitizedName = (name || 'New Sequence').toLowerCase().replace(/[^a-z0-9_-]/g, '_');
        const folderName = `${sanitizedName}_${Date.now()}`;

        set({
          project: {
            id: `proj-${Date.now()}`,
            name: name || 'New Sequence',
            folderName,
            width: width || 1920,
            height: height || 1080,
            fps: fps || 60,
            currentTime: 0,
            duration: 30,
            tracks: [
              { id: `track-${Date.now()}-1`, name: 'Layer 1', order: 0, muted: false, visible: true, locked: false, audioSettings: { ...defaultAudioSettings }, clips: [] },
              { id: `track-${Date.now()}-2`, name: 'Layer 2', order: 1, muted: false, visible: true, locked: false, audioSettings: { ...defaultAudioSettings }, clips: [] },
            ],
          },
          selectedClipId: null,
          selectedTrackId: `track-${Date.now()}-1`,
          isPlaying: false,
        });
      },

      setCurrentTime: (time) =>
        set((state) => ({
          project: {
            ...state.project,
            currentTime: Math.max(0, Math.min(state.project.duration, time)),
          },
        })),

      setSelectedClip: (clipId) => set({ selectedClipId: clipId }),
      setSelectedTrack: (trackId) => set({ selectedTrackId: trackId }),

      setIsPlaying: (isPlaying) => set({ isPlaying }),
      togglePlay: () => set((state) => ({ isPlaying: !state.isPlaying })),

      setProjectDuration: (duration) =>
        set((state) => ({
          project: {
            ...state.project,
            duration: Math.max(1, duration),
            currentTime: Math.min(state.project.currentTime, duration),
          },
        })),

      addTrack: () =>
        set((state) => {
          const newOrder = state.project.tracks.length;
          const newTrackId = `track-${Date.now()}`;
          return {
            project: {
              ...state.project,
              tracks: [
                ...state.project.tracks,
                {
                  id: newTrackId,
                  name: `Layer ${newOrder + 1}`,
                  order: newOrder,
                  muted: false,
                  visible: true,
                  locked: false,
                  audioSettings: { ...defaultAudioSettings },
                  clips: [],
                },
              ],
            },
            selectedTrackId: newTrackId,
          };
        }),

      deleteTrack: (trackId) =>
        set((state) => ({
          project: {
            ...state.project,
            tracks: state.project.tracks.filter((t) => t.id !== trackId),
          },
          selectedTrackId: state.selectedTrackId === trackId ? state.project.tracks[0]?.id || null : state.selectedTrackId,
        })),

      renameTrack: (trackId, newName) =>
        set((state) => ({
          project: {
            ...state.project,
            tracks: state.project.tracks.map((track) =>
              track.id === trackId ? { ...track, name: newName } : track
            ),
          },
        })),

      toggleTrackVisibility: (trackId) =>
        set((state) => ({
          project: {
            ...state.project,
            tracks: state.project.tracks.map((track) =>
              track.id === trackId ? { ...track, visible: track.visible === false } : track
            ),
          },
        })),

      toggleTrackLock: (trackId) =>
        set((state) => ({
          project: {
            ...state.project,
            tracks: state.project.tracks.map((track) =>
              track.id === trackId ? { ...track, locked: !track.locked } : track
            ),
          },
        })),

      toggleTrackMute: (trackId) =>
        set((state) => ({
          project: {
            ...state.project,
            tracks: state.project.tracks.map((track) =>
              track.id === trackId ? { ...track, muted: !track.muted } : track
            ),
          },
        })),

      updateTrackAudioSettings: (trackId, newSettings) =>
        set((state) => ({
          project: {
            ...state.project,
            tracks: state.project.tracks.map((track) =>
              track.id === trackId
                ? {
                    ...track,
                    audioSettings: {
                      ...defaultAudioSettings,
                      ...track.audioSettings,
                      ...newSettings,
                      ...(newSettings.volumeLeft !== undefined && {
                        volumeLeft: Math.max(0, Math.min(100, newSettings.volumeLeft)),
                      }),
                      ...(newSettings.volumeRight !== undefined && {
                        volumeRight: Math.max(0, Math.min(100, newSettings.volumeRight)),
                      }),
                    },
                  }
                : track
            ),
          },
        })),

      addClipToTrack: (trackId, clip) =>
        set((state) => ({
          project: {
            ...state.project,
            tracks: state.project.tracks.map((track) =>
              track.id === trackId ? { ...track, clips: [...track.clips, clip] } : track
            ),
          },
        })),

      importMediaToTrack: async (trackId, file) => {
        const projectFps = get().project.fps || 60;
        const processedFile = await convertMediaFPS(file, projectFps);
        
        const isVideo = processedFile.type.startsWith('video');
        const isAudio = processedFile.type.startsWith('audio');
        const type = isVideo ? 'video' : isAudio ? 'audio' : 'image';
        const fileUrl = (processedFile as any).savedUrl || URL.createObjectURL(processedFile);

        const newClip: MediaClip = {
          id: `clip-${Date.now()}`,
          name: processedFile.name,
          type,
          fileUrl,
          startTime: get().project.currentTime,
          duration: 5.0,
          sourceStart: 0,
          sourceDuration: 5.0,
          fps: projectFps,
          
          x: 0,
          y: 0,
          scale: 1.0,
          rotation: { x: 0, y: 0, z: 0 },
          opacity: 100,
          volume: 100,
          
          // -- Inisiasi Properti Efek Lama --
          saturation: 100,
          vibrance: 0,
          curves: 0,
          sharpen: 0,
          fadedFilm: 0,

          // -- NEW: Inisiasi Properti Coloring / Color Grading --
          brightness: 0,
          contrast: 0,
          temperature: 0,
          tint: 0,
          highlights: 0,
          shadows: 0,

          keyframes: {},
        };

        set((state) => {
          const tracks = state.project.tracks.map((track) => {
            if (track.id !== trackId) return track;
            return {
              ...track,
              clips: [...track.clips, newClip],
            };
          });
          return { project: { ...state.project, tracks } };
        });
      },

      splitClip: (trackId, clipId, splitTime) => {
        set((state) => {
          const tracks = state.project.tracks.map((track) => {
            if (track.id !== trackId) return track;

            const clipIndex = track.clips.findIndex((c) => c.id === clipId);
            if (clipIndex === -1) return track;

            const targetClip = track.clips[clipIndex];
            if (splitTime <= targetClip.startTime || splitTime >= targetClip.startTime + targetClip.duration) {
              return track;
            }

            const leftDuration = splitTime - targetClip.startTime;
            const rightDuration = targetClip.duration - leftDuration;

            const leftClip: MediaClip = { ...targetClip, duration: leftDuration };
            const rightClip: MediaClip = {
              ...targetClip,
              id: `clip-${Date.now()}`,
              startTime: splitTime,
              duration: rightDuration,
              sourceStart: targetClip.sourceStart + leftDuration,
            };

            const updatedClips = [...track.clips];
            updatedClips.splice(clipIndex, 1, leftClip, rightClip);

            return { ...track, clips: updatedClips };
          });

          return { project: { ...state.project, tracks } };
        });
      },

      deleteClip: (trackId, clipId) =>
        set((state) => ({
          project: {
            ...state.project,
            tracks: state.project.tracks.map((track) =>
              track.id === trackId
                ? { ...track, clips: track.clips.filter((c) => c.id !== clipId) }
                : track
            ),
          },
          selectedClipId: state.selectedClipId === clipId ? null : state.selectedClipId,
        })),

      trimClip: (trackId, clipId, requestedStart, requestedDuration) => {
        set((state) => {
          const tracks = state.project.tracks.map((track) => {
            if (track.id !== trackId) return track;

            const clip = track.clips.find((c) => c.id === clipId);
            if (!clip) return track;

            let newStart = Math.max(0, requestedStart);
            let newDuration = Math.max(1 / state.project.fps, requestedDuration);

            const otherClips = track.clips.filter((c) => c.id !== clipId);
            
            const prevClips = otherClips.filter((c) => c.startTime + c.duration <= clip.startTime);
            if (prevClips.length > 0) {
              const maxPrevEnd = Math.max(...prevClips.map((c) => c.startTime + c.duration));
              if (newStart < maxPrevEnd) {
                const diff = maxPrevEnd - newStart;
                newStart = maxPrevEnd;
                newDuration = Math.max(1 / state.project.fps, newDuration - diff);
              }
            }

            const nextClips = otherClips.filter((c) => c.startTime >= clip.startTime + clip.duration);
            if (nextClips.length > 0) {
              const minNextStart = Math.min(...nextClips.map((c) => c.startTime));
              if (newStart + newDuration > minNextStart) {
                newDuration = Math.max(1 / state.project.fps, minNextStart - newStart);
              }
            }

            return {
              ...track,
              clips: track.clips.map((c) =>
                c.id === clipId ? { ...c, startTime: newStart, duration: newDuration } : c
              ),
            };
          });

          return { project: { ...state.project, tracks } };
        });
      },

      moveClipToTrack: (fromTrackId, toTrackId, clipId, newStartTime) => {
        set((state) => {
          let movedClip: MediaClip | null = null;

          const sourceTracks = state.project.tracks.map((track) => {
            if (track.id === fromTrackId) {
              const target = track.clips.find((c) => c.id === clipId);
              if (target) movedClip = { ...target };
              return { ...track, clips: track.clips.filter((c) => c.id !== clipId) };
            }
            return track;
          });

          if (!movedClip) return state;

          const finalClip = movedClip as MediaClip;
          if (newStartTime !== undefined) finalClip.startTime = Math.max(0, newStartTime);

          const updatedTracks = sourceTracks.map((track) => {
            if (track.id === toTrackId) {
              let targetStartVal = finalClip.startTime;
              const otherClips = track.clips.filter((c) => c.id !== finalClip.id);
              
              for (const existing of otherClips) {
                if (
                  (targetStartVal >= existing.startTime && targetStartVal < existing.startTime + existing.duration) ||
                  (targetStartVal + finalClip.duration > existing.startTime && targetStartVal < existing.startTime)
                ) {
                  targetStartVal = existing.startTime + existing.duration;
                }
              }

              return {
                ...track,
                clips: [...track.clips, { ...finalClip, startTime: targetStartVal }],
              };
            }
            return track;
          });

          return { project: { ...state.project, tracks: updatedTracks } };
        });
      },

      updateClipTransform: (trackId, clipId, transform) =>
        set((state) => ({
          project: {
            ...state.project,
            tracks: state.project.tracks.map((track) =>
              track.id === trackId
                ? {
                    ...track,
                    clips: track.clips.map((clip) =>
                      clip.id === clipId
                        ? {
                            ...clip,
                            x: transform.x !== undefined ? transform.x : clip.x ?? 0,
                            y: transform.y !== undefined ? transform.y : clip.y ?? 0,
                            scale: transform.scale !== undefined ? transform.scale : clip.scale ?? 1,
                            rotation: transform.rotation !== undefined ? transform.rotation : clip.rotation ?? { x: 0, y: 0, z: 0 },
                            opacity: transform.opacity !== undefined ? transform.opacity : clip.opacity ?? 100,
                            volume: transform.volume !== undefined ? transform.volume : clip.volume ?? 100,
                            
                            // -- Update Efek Video Lama --
                            saturation: transform.saturation !== undefined ? transform.saturation : clip.saturation ?? 100,
                            vibrance: transform.vibrance !== undefined ? transform.vibrance : clip.vibrance ?? 0,
                            curves: transform.curves !== undefined ? transform.curves : clip.curves ?? 0,
                            sharpen: transform.sharpen !== undefined ? transform.sharpen : clip.sharpen ?? 0,
                            fadedFilm: transform.fadedFilm !== undefined ? transform.fadedFilm : clip.fadedFilm ?? 0,

                            // -- NEW: Update Efek Coloring / Color Grading --
                            brightness: transform.brightness !== undefined ? transform.brightness : clip.brightness ?? 0,
                            contrast: transform.contrast !== undefined ? transform.contrast : clip.contrast ?? 0,
                            temperature: transform.temperature !== undefined ? transform.temperature : clip.temperature ?? 0,
                            tint: transform.tint !== undefined ? transform.tint : clip.tint ?? 0,
                            highlights: transform.highlights !== undefined ? transform.highlights : clip.highlights ?? 0,
                            shadows: transform.shadows !== undefined ? transform.shadows : clip.shadows ?? 0,
                          }
                        : clip
                    ),
                  }
                : track
            ),
          },
        })),

      setClipKeyframe: (trackId, clipId, property, time, value) => 
        set((state) => {
          const fps = state.project.fps || 60;
          const targetFrame = Math.round(time * fps);

          const newTracks = state.project.tracks.map((track) => {
            if (track.id !== trackId) return track;
            const newClips = track.clips.map((clip) => {
              if (clip.id !== clipId) return clip;
              
              const currentKeyframes = clip.keyframes || {};
              const propKeyframes = [...(currentKeyframes[property] || [])];
              
              const existingIndex = propKeyframes.findIndex(kf => Math.round(kf.time * fps) === targetFrame);
              
              if (existingIndex >= 0) {
                propKeyframes[existingIndex].value = value;
              } else {
                propKeyframes.push({ time, value });
              }
              
              propKeyframes.sort((a, b) => a.time - b.time);
              
              return { 
                ...clip, 
                keyframes: { ...currentKeyframes, [property]: propKeyframes } 
              };
            });
            return { ...track, clips: newClips };
          });
          return { project: { ...state.project, tracks: newTracks } };
        }),

      removeClipKeyframe: (trackId, clipId, property, time) =>
        set((state) => {
          const fps = state.project.fps || 60;
          const targetFrame = Math.round(time * fps);

          const newTracks = state.project.tracks.map((track) => {
            if (track.id !== trackId) return track;
            const newClips = track.clips.map((clip) => {
              if (clip.id !== clipId || !clip.keyframes || !clip.keyframes[property]) return clip;
              
              const filteredKeyframes = clip.keyframes[property]!.filter(kf => Math.round(kf.time * fps) !== targetFrame);
              
              return { 
                ...clip, 
                keyframes: { ...clip.keyframes, [property]: filteredKeyframes } 
              };
            });
            return { ...track, clips: newClips };
          });
          return { project: { ...state.project, tracks: newTracks } };
        }),
    }),
    {
      partialize: (state) => ({ project: state.project }),
      limit: 50,
    }
  )
);