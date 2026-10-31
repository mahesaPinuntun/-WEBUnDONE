export type TrackType = 'video' | 'audio' | 'text';

export interface Transform {
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
  crop: { top: number; bottom: number; left: number; right: number };
}

export interface Clip {
  id: string;
  mediaId: string;
  name: string;
  type: TrackType;
  startTimeOnTimeline: number; // in seconds
  durationOnTimeline: number;  // in seconds
  trimStart: number;           // in seconds
  trimEnd: number;             // in seconds
  transform: Transform;
}

export interface Track {
  id: string;
  name: string;
  type: TrackType;
  zIndex: number;
  isVisible: boolean;
  isMuted: boolean;
  clips: Clip[];
}

export interface Project {
  id: string;
  name: string;
  fps: number;
  width: number;
  height: number;
  duration: number;
  tracks: Track[];
}

export type ExportFormat = 'mp4' | 'webm' | 'gif' | 'mp3';
export type ExportResolution = '720p' | '1080p' | '2k' | '4k';

export interface ExportOptions {
  format: ExportFormat;
  resolution: ExportResolution;
  fps: number;
  bitrateMbps: number;
}