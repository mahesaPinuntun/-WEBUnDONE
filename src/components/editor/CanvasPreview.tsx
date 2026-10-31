import React, { useEffect, useRef, useState } from "react";
import { useProjectStore, MediaClip } from "@/store/useProjectStore";
import { saveMediaToProjectPackage } from "@/utils/fileSystem";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

// MEMBUTUHKAN: npm i webm-muxer mp4-muxer
import { Muxer as WebMMuxer, ArrayBufferTarget as WebMArrayBufferTarget } from "webm-muxer"; 
import { Muxer as Mp4Muxer, ArrayBufferTarget as Mp4ArrayBufferTarget } from "mp4-muxer";

import {
  Volume2,
  Clock,
  X,
  Sliders,
  Layers,
  FolderPlus,
  Wand2,
  Type,
  Trash2,
  Plus,
  Image as ImageIcon,
  Film,
  Music,
  Loader2,
  Maximize,
  Diamond,
  ChevronDown,
  Link2,
  Save,
  Download,
  Video,
  Palette,
} from "lucide-react";

type SettingTab =
  | "media"
  | "effects"
  | "coloring"
  | "transform"
  | "text"
  | "audio"
  | "duration"
  | "export"
  | null;

export interface StoredMediaItem {
  id: string;
  name: string;
  type: "image" | "video" | "audio";
  dataUrl: string;
  size: number;
  createdAt: number;
}
export interface KeyframeData {
  time: number;
  value: any;
}
interface CanvasPreviewProps {
  currentProjectDirHandle?: FileSystemDirectoryHandle | null;
}

function audioBufferToWav(buffer: AudioBuffer) {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1;
  const bitDepth = 16;
  const result = new Float32Array(buffer.length * numChannels);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < buffer.length; i++) {
      result[i * numChannels + channel] = channelData[i];
    }
  }

  const dataLength = result.length * (bitDepth / 8);
  const bufferArray = new ArrayBuffer(44 + dataLength);
  const view = new DataView(bufferArray);
  const writeString = (view: DataView, offset: number, string: string) => {
    for (let i = 0; i < string.length; i++)
      view.setUint8(offset + i, string.charCodeAt(i));
  };

  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataLength, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * (bitDepth / 8), true);
  view.setUint16(32, numChannels * (bitDepth / 8), true);
  view.setUint16(34, bitDepth, true);
  writeString(view, 36, "data");
  view.setUint32(40, dataLength, true);

  let offset = 44;
  for (let i = 0; i < result.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, result[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Uint8Array(bufferArray);
}

export const CanvasPreview: React.FC<CanvasPreviewProps> = ({
  currentProjectDirHandle,
}) => {
  const {
    project,
    isPlaying,
    togglePlay,
    setCurrentTime,
    setProjectDuration,
    selectedTrackId,
    setSelectedTrack,
    selectedClipId,
    setSelectedClip,
    updateTrackAudioSettings,
    updateClipTransform,
    addClipToTrack,
    setClipKeyframe,
  } = useProjectStore();

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mediaElementsRef = useRef<{
    [clipId: string]: HTMLImageElement | HTMLVideoElement | HTMLAudioElement;
  }>({});

  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioNodesRef = useRef<{
    [clipId: string]: {
      gainL: GainNode;
      gainR: GainNode;
      eqLow: BiquadFilterNode;
      eqMid: BiquadFilterNode;
      eqHigh: BiquadFilterNode;
    };
  }>({});

  const clipBoundsRef = useRef<{
    [clipId: string]: { x: number; y: number; w: number; h: number };
  }>({});

  const [activeTab, setActiveTab] = useState<SettingTab>("media");
  const [, setForceRender] = useState({});
  const projectStorageKey = `forvidz_media_${project.id}`;

  const isDraggingMedia = useRef<boolean>(false);
  const dragStartPos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const activeClipRef = useRef<{ trackId: string; clip: MediaClip } | null>(
    null
  );
  const draggedTransform = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Transform States
  const [posX, setPosX] = useState<number>(0);
  const [posY, setPosY] = useState<number>(0);
  const [scaleV, setScaleV] = useState<number>(100);
  const [rotationX, setRotationX] = useState<number>(0);
  const [rotationY, setRotationY] = useState<number>(0);
  const [rotationZ, setRotationZ] = useState<number>(0);
  const [opacityV, setOpacityV] = useState<number>(100);

  // Video Effects States
  const [saturationV, setSaturationV] = useState<number>(100);
  const [vibranceV, setVibranceV] = useState<number>(0);
  const [curvesV, setCurvesV] = useState<number>(0);
  const [sharpenV, setSharpenV] = useState<number>(0);
  const [fadedFilmV, setFadedFilmV] = useState<number>(0);

  // Coloring / Lumetri Color States
  const [brightnessV, setBrightnessV] = useState<number>(0);
  const [contrastV, setContrastV] = useState<number>(0);
  const [temperatureV, setTemperatureV] = useState<number>(0);
  const [tintV, setTintV] = useState<number>(0);
  const [highlightsV, setHighlightsV] = useState<number>(0);
  const [shadowsV, setShadowsV] = useState<number>(0);

  const [importedMediaList, setImportedMediaList] = useState<StoredMediaItem[]>(
    []
  );
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const [importProgress, setImportProgress] = useState<number>(0);
  const [importStatusText, setImportStatusText] = useState<string>("");
  const [addingToTrackId, setAddingToTrackId] = useState<string | null>(null);

  const mediaInputRef = useRef<HTMLInputElement | null>(null);
  const [leftWidth, setLeftWidth] = useState<number>(180);
  const [rightWidth, setRightWidth] = useState<number>(260);
  const isDraggingLeft = useRef<boolean>(false);
  const isDraggingRight = useRef<boolean>(false);

  const currentDurationSec = project.duration || 30;
  const [hours, setHours] = useState<number>(
    Math.floor(currentDurationSec / 3600)
  );
  const [minutes, setMinutes] = useState<number>(
    Math.floor((currentDurationSec % 3600) / 60)
  );
  const [seconds, setSeconds] = useState<number>(
    Math.floor(currentDurationSec % 60)
  );
  const [ms, setMs] = useState<number>(
    Math.round((currentDurationSec % 1) * 1000)
  );

  const fps = project.fps || 30;
  const canvasWidth = project.width || 1920;
  const canvasHeight = project.height || 1080;

  const [exportFormat, setExportFormat] = useState<string>("mp4");
  const [exportEngine, setExportEngine] = useState<"ffmpeg" | "webcodecs">("webcodecs");
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportProgress, setExportProgress] = useState<number>(0);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  const activeTrack =
    project.tracks.find((t) => t.id === selectedTrackId) || project.tracks[0];
  const trackAudio = activeTrack?.audioSettings || {
    volumeLeft: 100,
    volumeRight: 100,
    muted: false,
    pitch: 0,
    eqLow: 0,
    eqMid: 0,
    eqHigh: 0,
  };

  const handleSaveProject = async () => {
    setSaveStatus("Saving...");
    try {
      localStorage.setItem(
        `forvidz_project_${project.id}`,
        JSON.stringify(project)
      );
      if (currentProjectDirHandle) {
        const fileHandle = await currentProjectDirHandle.getFileHandle(
          "project.json",
          { create: true }
        );
        const writable = await fileHandle.createWritable();
        await writable.write(JSON.stringify(project, null, 2));
        await writable.close();
      }
      setSaveStatus("Project saved successfully!");
      setTimeout(() => setSaveStatus(null), 3000);
    } catch (e) {
      console.error(e);
      setSaveStatus("Failed to save project.");
      setTimeout(() => setSaveStatus(null), 3000);
    }
  };

  // --- AUDIO MIXING HELPER (Bisa digunakan oleh WebCodecs dan FFmpeg) ---
  const mixProjectAudio = async (durationSec: number, tracks: any[]) => {
    let hasAnyAudio = false;
    for (const track of tracks) {
      if (track.muted || track.audioSettings?.muted) continue;
      if (track.clips.some((c: any) => c.type === "video" || c.type === "audio")) {
        hasAnyAudio = true;
        break;
      }
    }
    if (!hasAnyAudio) return null;

    const AudioContextClass = window.OfflineAudioContext || (window as any).webkitOfflineAudioContext;
    const offlineCtx = new AudioContextClass(2, Math.max(1, durationSec * 44100), 44100);

    let actuallyAdded = false;
    for (const track of tracks) {
      if (track.muted || track.audioSettings?.muted) continue;
      const volL = (track.audioSettings?.volumeLeft ?? 100) / 100;
      const volR = (track.audioSettings?.volumeRight ?? 100) / 100;
      const eqL = track.audioSettings?.eqLow ?? 0;
      const eqM = track.audioSettings?.eqMid ?? 0;
      const eqH = track.audioSettings?.eqHigh ?? 0;

      for (const clip of track.clips) {
        if (clip.type === "video" || clip.type === "audio") {
          try {
            const res = await fetch(clip.fileUrl);
            const buf = await res.arrayBuffer();
            const audioBuf = await offlineCtx.decodeAudioData(buf);
            const source = offlineCtx.createBufferSource();
            source.buffer = audioBuf;

            const preGain = offlineCtx.createGain();
            preGain.channelCount = 2;
            preGain.channelCountMode = "explicit";
            const eqLow = offlineCtx.createBiquadFilter();
            eqLow.type = "lowshelf"; eqLow.frequency.value = 320; eqLow.gain.value = eqL;
            const eqMid = offlineCtx.createBiquadFilter();
            eqMid.type = "peaking"; eqMid.frequency.value = 1000; eqMid.gain.value = eqM;
            const eqHigh = offlineCtx.createBiquadFilter();
            eqHigh.type = "highshelf"; eqHigh.frequency.value = 3200; eqHigh.gain.value = eqH;

            const splitter = offlineCtx.createChannelSplitter(2);
            const merger = offlineCtx.createChannelMerger(2);
            const gainL = offlineCtx.createGain();
            const gainR = offlineCtx.createGain();
            gainL.gain.value = volL; gainR.gain.value = volR;

            source.connect(preGain);
            preGain.connect(eqLow); eqLow.connect(eqMid); eqMid.connect(eqHigh); eqHigh.connect(splitter);
            splitter.connect(gainL, 0); splitter.connect(gainR, 1);
            gainL.connect(merger, 0, 0); gainR.connect(merger, 0, 1);
            merger.connect(offlineCtx.destination);

            source.start(clip.startTime, clip.sourceStart, clip.duration);
            actuallyAdded = true;
          } catch (err) {
            console.warn("Gagal merender audio klip:", clip.name);
          }
        }
      }
    }
    if (!actuallyAdded) return null;
    return await offlineCtx.startRendering();
  };

  const drawFrameOffline = async (
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    canvas: HTMLCanvasElement | OffscreenCanvas,
    renderTime: number
  ) => {
    ctx.fillStyle = "#060709";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const tracksForRendering = [...project.tracks].reverse();

    for (const track of tracksForRendering) {
      if (track.visible === false) continue;
      for (const clip of track.clips) {
        const clipEnd = clip.startTime + clip.duration;
        if (renderTime >= clip.startTime && renderTime <= clipEnd) {
          const media = mediaElementsRef.current[clip.id];
          if (!media) continue;

          if (clip.type === "video" && media instanceof HTMLVideoElement) {
            const clipElapsed = renderTime - clip.startTime;
            const targetTime = clip.sourceStart + clipElapsed;

            await new Promise<void>((resolve) => {
              if (Math.abs(media.currentTime - targetTime) < 0.05) {
                resolve();
              } else {
                const onSeeked = () => {
                  media.removeEventListener("seeked", onSeeked);
                  resolve();
                };
                media.addEventListener("seeked", onSeeked);
                media.currentTime = targetTime;
              }
            });
            await drawMediaAspectFit(
              ctx,
              media,
              canvas.width,
              canvas.height,
              clip,
              renderTime,
              true
            );
          } else if (
            (clip.type === "image" || clip.type === "gif") &&
            media instanceof HTMLImageElement
          ) {
            if (media.complete && media.naturalWidth > 0) {
              await drawMediaAspectFit(
                ctx,
                media,
                canvas.width,
                canvas.height,
                clip,
                renderTime,
                true
              );
            }
          }
        }
      }
    }
  };

  // --- EXPORT OPTION 2: WebGL + WebCodecs API (GPU Accelerated) ---
  const handleWebCodecsExport = async () => {
    if (isExporting) return;
    await handleSaveProject();
    if (isPlaying && togglePlay) togglePlay();

    setIsExporting(true);
    setExportProgress(0);

    try {
      setSaveStatus("Mixing Audio Tracks...");
      const renderedAudioBuffer = await mixProjectAudio(project.duration, project.tracks);
      const projectHasAudio = renderedAudioBuffer !== null;

      setSaveStatus("Initializing GPU WebCodecs Engine...");
      
      const exportCanvas = typeof OffscreenCanvas !== "undefined" 
        ? new OffscreenCanvas(canvasWidth, canvasHeight) 
        : document.createElement("canvas");
      
      if (exportCanvas instanceof HTMLCanvasElement) {
        exportCanvas.width = canvasWidth;
        exportCanvas.height = canvasHeight;
      }

      const exportCtx = exportCanvas.getContext("2d", {
        alpha: false,
        desynchronized: true,
        willReadFrequently: false 
      }) as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

      if (!exportCtx) throw new Error("Gagal membuat GPU Canvas Context");

      // Validasi dimensi: H264 (MP4) mengharuskan resolusi bernilai genap (even numbers)
      const encWidth = canvasWidth % 2 === 0 ? canvasWidth : canvasWidth - 1;
      const encHeight = canvasHeight % 2 === 0 ? canvasHeight : canvasHeight - 1;

      let muxer: any;
      if (exportFormat === "mp4") {
        muxer = new Mp4Muxer({
          target: new Mp4ArrayBufferTarget(),
          video: { codec: "avc", width: encWidth, height: encHeight },
          ...(projectHasAudio && { audio: { codec: "aac", numberOfChannels: 2, sampleRate: 44100 } }),
          fastStart: "in-memory",
        });
      } else {
        muxer = new WebMMuxer({
          target: new WebMArrayBufferTarget(),
          video: { codec: "V_VP8", width: encWidth, height: encHeight, frameRate: fps },
          ...(projectHasAudio && { audio: { codec: "A_OPUS", numberOfChannels: 2, sampleRate: 44100 } }),
        });
      }

      // 1. Eksekusi Encode Audio (Jika Ada)
      if (projectHasAudio) {
        setSaveStatus("Encoding Audio...");
        const audioEncoder = new AudioEncoder({
          output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
          error: (e) => console.error("AudioEncoder Error:", e),
        });

        audioEncoder.configure({
          codec: exportFormat === "mp4" ? "mp4a.40.2" : "opus",
          sampleRate: 44100,
          numberOfChannels: 2,
          bitrate: 128_000,
        });

        // Potong buffer menjadi pecahan kecil
        const chunkSize = 44100; // 1 Detik per chunk
        for (let i = 0; i < renderedAudioBuffer.length; i += chunkSize) {
          const frames = Math.min(chunkSize, renderedAudioBuffer.length - i);
          const planarData = new Float32Array(frames * 2);
          
          // Format 'f32-planar': Channel 1 (L) didepan secara penuh, dilanjutkan Channel 2 (R) secara penuh
          planarData.set(renderedAudioBuffer.getChannelData(0).subarray(i, i + frames), 0);
          planarData.set(renderedAudioBuffer.getChannelData(1).subarray(i, i + frames), frames);

          const audioData = new AudioData({
            format: 'f32-planar',
            sampleRate: 44100,
            numberOfFrames: frames,
            numberOfChannels: 2,
            timestamp: (i / 44100) * 1_000_000,
            data: planarData
          });

          audioEncoder.encode(audioData);
          audioData.close();
        }
        await audioEncoder.flush();
        audioEncoder.close();
      }

      // 2. Eksekusi Encode Video Frame
      const videoEncoder = new VideoEncoder({
        output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
        error: (e) => console.error("VideoEncoder Error:", e),
      });

      const encoderConfig: VideoEncoderConfig = {
        codec: exportFormat === "mp4" ? "avc1.4d002a" : "vp8", 
        width: encWidth,
        height: encHeight,
        bitrate: 5_000_000,
        framerate: fps,
        hardwareAcceleration: "prefer-hardware",
      };

      const support = await VideoEncoder.isConfigSupported(encoderConfig);
      if (!support.supported) {
        console.warn("Hardware acceleration not supported for this codec. Falling back to software mode.");
        encoderConfig.hardwareAcceleration = "prefer-software"; 
        const fallbackSupport = await VideoEncoder.isConfigSupported(encoderConfig);
        if (!fallbackSupport.supported) {
          throw new Error(`Browser Anda tidak mendukung render Codec ${encoderConfig.codec}`);
        }
      }

      await videoEncoder.configure(encoderConfig);

      const totalFrames = Math.floor(project.duration * fps);
      const frameDurationMicroseconds = 1_000_000 / fps;

      for (let frame = 0; frame < totalFrames; frame++) {
        const time = frame / fps;
        setSaveStatus(`GPU Rendering Frame ${frame + 1}/${totalFrames}`);
        setExportProgress(Math.round((frame / totalFrames) * 90));

        await drawFrameOffline(exportCtx, exportCanvas, time);

        const videoFrame = new VideoFrame(exportCanvas, {
          timestamp: Math.round(frame * frameDurationMicroseconds),
        });

        try {
          const keyFrame = frame % (fps * 2) === 0;
          videoEncoder.encode(videoFrame, { keyFrame });
        } catch (err) {
          console.error("Frame encode error:", err);
          throw err;
        } finally {
          videoFrame.close();
        }
      }

      setSaveStatus("Flushing Hardware Encoder...");
      await videoEncoder.flush();
      muxer.finalize();

      const { buffer } = muxer.target;
      const mimeType = exportFormat === "mp4" ? "video/mp4" : "video/webm";
      const extension = exportFormat === "mp4" ? "mp4" : "webm";

      const blob = new Blob([buffer], { type: mimeType });
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      document.body.appendChild(a);
      a.style.display = "none";
      a.href = url;
      a.download = `${project.name || "forvidz_export"}.${extension}`;
      a.click();

      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      setSaveStatus("GPU Export Complete!");
      setTimeout(() => setSaveStatus(null), 4000);
    } catch (err) {
      console.error(err);
      setSaveStatus(err instanceof Error ? err.message : "Export failed! Check console.");
      setTimeout(() => setSaveStatus(null), 4000);
    } finally {
      setIsExporting(false);
    }
  };

  // --- EXPORT OPTION 1: FFmpeg WASM ---
  const handleFFmpegExport = async () => {
    if (isExporting) return;
    await handleSaveProject();

    const exportCanvas = typeof OffscreenCanvas !== "undefined"
        ? new OffscreenCanvas(canvasWidth, canvasHeight)
        : document.createElement("canvas");

    if (exportCanvas instanceof HTMLCanvasElement) {
      exportCanvas.width = canvasWidth;
      exportCanvas.height = canvasHeight;
    }

    const exportCtx = exportCanvas.getContext("2d", {
      alpha: false,
      desynchronized: true,
      willReadFrequently: false 
    }) as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

    if (!exportCtx) return setSaveStatus("Error: Gagal membuat GPU Canvas Context");

    if (isPlaying && togglePlay) togglePlay();

    setIsExporting(true);
    setExportProgress(0);

    try {
      setSaveStatus("Starting FFmpeg Engine...");
      const ffmpeg = new FFmpeg();
      const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm";
      await ffmpeg.load({
        coreURL: await toBlobURL(
          `${baseURL}/ffmpeg-core.js`,
          "text/javascript"
        ),
        wasmURL: await toBlobURL(
          `${baseURL}/ffmpeg-core.wasm`,
          "application/wasm"
        ),
      });

      ffmpeg.on("progress", ({ progress }) => {
        setExportProgress(50 + Math.round(progress * 50));
      });

      setSaveStatus("Mixing Audio...");
      const renderedAudioBuffer = await mixProjectAudio(project.duration, project.tracks);
      const hasAudio = renderedAudioBuffer !== null;

      if (hasAudio) {
         const wavBytes = audioBufferToWav(renderedAudioBuffer);
         await ffmpeg.writeFile("audio.wav", wavBytes);
      }

      const totalFrames = Math.floor(project.duration * fps);
      for (let frame = 0; frame < totalFrames; frame++) {
        const time = frame / fps;
        setSaveStatus(`Rendering Frame ${frame + 1}/${totalFrames}`);
        setExportProgress(Math.round((frame / totalFrames) * 50));

        await drawFrameOffline(exportCtx, exportCanvas, time);
        const fileName = `frame_${frame.toString().padStart(5, "0")}.jpg`;

        if (exportCanvas instanceof OffscreenCanvas) {
          const blob = await exportCanvas.convertToBlob({ type: "image/jpeg", quality: 0.9 });
          const arrayBuf = await blob.arrayBuffer();
          await ffmpeg.writeFile(fileName, new Uint8Array(arrayBuf));
        } else {
          const dataUrl = exportCanvas.toDataURL("image/jpeg", 0.9);
          await ffmpeg.writeFile(fileName, await fetchFile(dataUrl));
        }
      }

      setSaveStatus(`Encoding ${exportFormat.toUpperCase()}...`);
      const outName = `output.${exportFormat}`;
      const args = ["-framerate", `${fps}`, "-i", "frame_%05d.jpg"];

      if (hasAudio) args.push("-i", "audio.wav");

      if (exportFormat === "mp4") {
        args.push("-c:v", "libx264", "-pix_fmt", "yuv420p");
        if (hasAudio) args.push("-c:a", "aac", "-b:a", "192k");
      } else if (exportFormat === "webm") {
        args.push("-c:v", "libvpx-vp9");
        if (hasAudio) args.push("-c:a", "libopus");
      } else {
        args.push(
          "-vf",
          "split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse",
          "-loop",
          "0"
        );
      }

      args.push(outName);
      await ffmpeg.exec(args);

      const fileData = await ffmpeg.readFile(outName);
      const data = fileData as Uint8Array;
      const mime =
        exportFormat === "mp4"
          ? "video/mp4"
          : exportFormat === "webm"
          ? "video/webm"
          : "image/gif";

      const blob = new Blob([data as any], { type: mime });
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      document.body.appendChild(a);
      a.style.display = "none";
      a.href = url;
      a.download = `${project.name || "forvidz_export"}.${exportFormat}`;
      a.click();

      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      setSaveStatus("Export Complete!");
      setTimeout(() => setSaveStatus(null), 4000);
    } catch (err) {
      console.error(err);
      setSaveStatus("Export failed! Check console.");
      setTimeout(() => setSaveStatus(null), 4000);
    } finally {
      setIsExporting(false);
    }
  };

  const handleSaveAndExport = async () => {
    if (exportEngine === "webcodecs") {
      await handleWebCodecsExport();
    } else {
      await handleFFmpegExport();
    }
  };

  const getInterpolatedValue = (
    currentTime: number,
    kfArray: KeyframeData[] | undefined,
    fallback: any
  ) => {
    if (!kfArray || kfArray.length === 0) return fallback;
    if (kfArray.length === 1) return kfArray[0].value;

    let kfStart = kfArray[0];
    let kfEnd = kfArray[kfArray.length - 1];

    for (let i = 0; i < kfArray.length - 1; i++) {
      if (
        currentTime >= kfArray[i].time &&
        currentTime <= kfArray[i + 1].time
      ) {
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

    if (typeof kfStart.value === "object" && kfStart.value !== null) {
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

  const isAnimationEnabled = (propKey: string) => {
    if (!selectedClipId) return false;
    const track = project.tracks.find((t) =>
      t.clips.some((c) => c.id === selectedClipId)
    );
    const clip = track?.clips.find((c) => c.id === selectedClipId);
    if (!clip) return false;
    if ((clip as any)[`animActive_${propKey}`] === false) return false;

    if (propKey === "position") {
      const kfsX = (clip as any).keyframes?.["x"] || [];
      const kfsY = (clip as any).keyframes?.["y"] || [];
      return kfsX.length > 0 || kfsY.length > 0;
    } else {
      const kfs = (clip as any).keyframes?.[propKey] || [];
      return kfs.length > 0;
    }
  };

  const handleToggleAnimation = (propKey: string) => {
    if (!selectedClipId) return;
    const track = project.tracks.find((t) =>
      t.clips.some((c) => c.id === selectedClipId)
    );
    const clip = track?.clips.find((c) => c.id === selectedClipId);
    if (!clip || !track) return;

    const localTime = project.currentTime - clip.startTime;
    const isEnabled = isAnimationEnabled(propKey);

    const currentFrame = Math.round(localTime * fps);
    const exactLocalTime = currentFrame / fps;

    if (isEnabled) {
      if (propKey === "position") {
        const currentX = getInterpolatedValue(
          exactLocalTime,
          (clip as any).keyframes?.["x"],
          clip.x ?? 0
        );
        const currentY = getInterpolatedValue(
          exactLocalTime,
          (clip as any).keyframes?.["y"],
          clip.y ?? 0
        );
        updateClipTransform(track.id, clip.id, {
          animActive_position: false,
          x: currentX,
          y: currentY,
        } as any);
      } else if (propKey === "rotation") {
        const currentRot = getInterpolatedValue(
          exactLocalTime,
          (clip as any).keyframes?.["rotation"],
          (clip as any).rotation || { x: 0, y: 0, z: 0 }
        );
        updateClipTransform(track.id, clip.id, {
          animActive_rotation: false,
          rotation: currentRot,
        } as any);
      } else {
        let fallbackVal = (clip as any)[propKey] as number;
        if (fallbackVal === undefined) {
          if (propKey === "scale") fallbackVal = 1;
          else if (propKey === "opacity") fallbackVal = 100;
          else if (propKey === "saturation") fallbackVal = 100;
          else fallbackVal = 0;
        }
        const currentVal = getInterpolatedValue(
          exactLocalTime,
          (clip as any).keyframes?.[propKey],
          fallbackVal
        );
        updateClipTransform(track.id, clip.id, {
          [`animActive_${propKey}`]: false,
          [propKey]: currentVal,
        } as any);
      }
    } else {
      if (localTime < 0 || localTime > clip.duration) {
        alert(
          "Playhead (garis waktu) harus berada di atas media untuk memulai animasi!"
        );
        return;
      }
      updateClipTransform(track.id, clip.id, {
        [`animActive_${propKey}`]: true,
      } as any);
      const kfsLength =
        propKey === "position"
          ? (clip as any).keyframes?.x?.length || 0
          : (clip as any).keyframes?.[propKey]?.length || 0;

      if (kfsLength === 0) {
        if (propKey === "position") {
          setClipKeyframe(track.id, clip.id, "x", exactLocalTime, clip.x ?? 0);
          setClipKeyframe(track.id, clip.id, "y", exactLocalTime, clip.y ?? 0);
        } else if (propKey === "rotation") {
          setClipKeyframe(
            track.id,
            clip.id,
            "rotation",
            exactLocalTime,
            (clip as any).rotation || { x: 0, y: 0, z: 0 }
          );
        } else {
          let currentVal = (clip as any)[propKey] as number;
          if (currentVal === undefined) {
            if (propKey === "scale") currentVal = 1;
            else if (propKey === "opacity") currentVal = 100;
            else if (propKey === "saturation") currentVal = 100;
            else currentVal = 0;
          }
          setClipKeyframe(
            track.id,
            clip.id,
            propKey as any,
            exactLocalTime,
            currentVal
          );
        }
      }
    }
  };

  useEffect(() => {
    if ((activeTab === "transform" || activeTab === "effects" || activeTab === "coloring") && selectedClipId) {
      let found = false;
      for (const track of project.tracks) {
        const clip = track.clips.find((c) => c.id === selectedClipId);
        if (clip && !isDraggingMedia.current) {
          const currentClipTime = project.currentTime - clip.startTime;

          const isPosActive = (clip as any).animActive_position !== false;
          const curX = isPosActive ? getInterpolatedValue(currentClipTime, (clip as any).keyframes?.x, clip.x ?? 0) : (clip.x ?? 0);
          const curY = isPosActive ? getInterpolatedValue(currentClipTime, (clip as any).keyframes?.y, clip.y ?? 0) : (clip.y ?? 0);

          const isScaleActive = (clip as any).animActive_scale !== false;
          const curScale = (isScaleActive ? getInterpolatedValue(currentClipTime, (clip as any).keyframes?.scale, clip.scale ?? 1.0) : (clip.scale ?? 1.0)) * 100;

          const isRotActive = (clip as any).animActive_rotation !== false;
          const defaultRot = { x: 0, y: 0, z: 0 };
          const curRot = isRotActive ? getInterpolatedValue(currentClipTime, (clip as any).keyframes?.rotation, (clip as any).rotation || defaultRot) : (clip as any).rotation || defaultRot;

          const isOpActive = (clip as any).animActive_opacity !== false;
          const curOp = isOpActive ? getInterpolatedValue(currentClipTime, (clip as any).keyframes?.opacity, (clip as any).opacity ?? 100) : ((clip as any).opacity ?? 100);

          const isSatActive = (clip as any).animActive_saturation !== false;
          const curSat = isSatActive ? getInterpolatedValue(currentClipTime, (clip as any).keyframes?.saturation, (clip as any).saturation ?? 100) : ((clip as any).saturation ?? 100);
          
          const isVibActive = (clip as any).animActive_vibrance !== false;
          const curVib = isVibActive ? getInterpolatedValue(currentClipTime, (clip as any).keyframes?.vibrance, (clip as any).vibrance ?? 0) : ((clip as any).vibrance ?? 0);
          
          const isCurvesActive = (clip as any).animActive_curves !== false;
          const curCurves = isCurvesActive ? getInterpolatedValue(currentClipTime, (clip as any).keyframes?.curves, (clip as any).curves ?? 0) : ((clip as any).curves ?? 0);
          
          const isSharpenActive = (clip as any).animActive_sharpen !== false;
          const curSharpen = isSharpenActive ? getInterpolatedValue(currentClipTime, (clip as any).keyframes?.sharpen, (clip as any).sharpen ?? 0) : ((clip as any).sharpen ?? 0);
          
          const isFadedActive = (clip as any).animActive_fadedFilm !== false;
          const curFaded = isFadedActive ? getInterpolatedValue(currentClipTime, (clip as any).keyframes?.fadedFilm, (clip as any).fadedFilm ?? 0) : ((clip as any).fadedFilm ?? 0);

          const curBright = clip.brightness ?? 0;
          const curContrast = clip.contrast ?? 0;
          const curTemp = clip.temperature ?? 0;
          const curTint = clip.tint ?? 0;
          const curHigh = clip.highlights ?? 0;
          const curShadow = clip.shadows ?? 0;

          setPosX(Number(curX.toFixed(1)));
          setPosY(Number(curY.toFixed(1)));
          setScaleV(Number(curScale.toFixed(1)));
          setRotationX(Number(curRot.x.toFixed(1)));
          setRotationY(Number(curRot.y.toFixed(1)));
          setRotationZ(Number(curRot.z.toFixed(1)));
          setOpacityV(Number(curOp.toFixed(1)));
          
          setSaturationV(Number(curSat.toFixed(1)));
          setVibranceV(Number(curVib.toFixed(1)));
          setCurvesV(Number(curCurves.toFixed(1)));
          setSharpenV(Number(curSharpen.toFixed(1)));
          setFadedFilmV(Number(curFaded.toFixed(1)));

          setBrightnessV(Number(curBright.toFixed(1)));
          setContrastV(Number(curContrast.toFixed(1)));
          setTemperatureV(Number(curTemp.toFixed(1)));
          setTintV(Number(curTint.toFixed(1)));
          setHighlightsV(Number(curHigh.toFixed(1)));
          setShadowsV(Number(curShadow.toFixed(1)));
          
          found = true;
          break;
        }
      }
      if (!found) {
        setPosX(0); setPosY(0); setScaleV(100); setRotationX(0); setRotationY(0); setRotationZ(0); setOpacityV(100);
        setSaturationV(100); setVibranceV(0); setCurvesV(0); setSharpenV(0); setFadedFilmV(0);
        setBrightnessV(0); setContrastV(0); setTemperatureV(0); setTintV(0); setHighlightsV(0); setShadowsV(0);
      }
    }
  }, [project.currentTime, selectedClipId, activeTab, project.tracks]);

  useEffect(() => {
    setImportedMediaList([]);
    try {
      const saved = localStorage.getItem(projectStorageKey);
      if (saved) setImportedMediaList(JSON.parse(saved));
    } catch (e) {}

    if (currentProjectDirHandle) {
      const loadMediaFilesFromDisk = async () => {
        try {
          const mediaDir = await currentProjectDirHandle.getDirectoryHandle(
            "media",
            { create: true }
          );
          const validMediaItems: StoredMediaItem[] = [];

          for await (const entry of mediaDir.values()) {
            if (entry.kind === "file") {
              const fileHandle = entry as FileSystemFileHandle;
              const file = await fileHandle.getFile();
              const freshBlobUrl = URL.createObjectURL(file);

              let mediaType: "image" | "video" | "audio" = "image";
              if (file.type.startsWith("video/")) mediaType = "video";
              else if (file.type.startsWith("audio/")) mediaType = "audio";

              validMediaItems.push({
                id: `media_${file.name}`,
                name: file.name,
                type: mediaType,
                dataUrl: freshBlobUrl,
                size: file.size,
                createdAt: file.lastModified,
              });
            }
          }
          if (validMediaItems.length > 0) setImportedMediaList(validMediaItems);
        } catch (err) {}
      };
      loadMediaFilesFromDisk();
    }
  }, [project.id, currentProjectDirHandle]);

  useEffect(() => {
    if (!project.id) return;
    try {
      localStorage.setItem(
        projectStorageKey,
        JSON.stringify(importedMediaList)
      );
    } catch (e) {}
  }, [importedMediaList, project.id, projectStorageKey]);

  const handleMediaImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    if (!currentProjectDirHandle) {
      alert("Error: Handle direktori proyek belum terbuka.");
      return;
    }

    setIsImporting(true);
    setImportProgress(5);
    setImportStatusText("Memulai pengimporan ke folder proyek...");

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const saved = await saveMediaToProjectPackage(
          currentProjectDirHandle,
          file,
          project.fps || 60,
          (progress, status) => {
            const currentFileProgress = Math.round(
              ((i + progress / 100) / files.length) * 100
            );
            setImportProgress(currentFileProgress);
            setImportStatusText(`[${i + 1}/${files.length}] ${status}`);
          }
        );

        let mediaType: "image" | "video" | "audio" = "image";
        if (file.type.startsWith("video/")) mediaType = "video";
        else if (file.type.startsWith("audio/")) mediaType = "audio";

        const newItem: StoredMediaItem = {
          id: `media_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          name: saved.fileName,
          type: mediaType,
          dataUrl: saved.fileUrl,
          size: file.size,
          createdAt: Date.now(),
        };
        setImportedMediaList((prev) => [newItem, ...prev]);
      } catch (err) {}
    }
    setImportProgress(100);
    setImportStatusText("Impor selesai!");
    setTimeout(() => {
      setIsImporting(false);
      setImportProgress(0);
      setImportStatusText("");
    }, 1000);
    e.target.value = "";
  };

  const handleDeleteMedia = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setImportedMediaList((prev) => prev.filter((item) => item.id !== id));
  };

  const handleAddToTimeline = async (item: StoredMediaItem) => {
    setAddingToTrackId(item.id);
    try {
      let duration = 5;
      if (item.type === "video" || item.type === "audio") {
        const tempMedia = document.createElement(
          item.type === "video" ? "video" : "audio"
        );
        tempMedia.src = item.dataUrl;
        await new Promise((resolve) => {
          tempMedia.onloadedmetadata = () => {
            duration = tempMedia.duration || 5;
            resolve(true);
          };
          tempMedia.onerror = () => resolve(false);
        });
      }

      const newClip: MediaClip = {
        id: `clip_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        name: item.name,
        type: item.type,
        fileUrl: item.dataUrl,
        startTime: project.currentTime || 0,
        duration: duration,
        sourceStart: 0,
        sourceDuration: duration,
        x: 0,
        y: 0,
        scale: 1,
        opacity: 100,
        brightness: 0,
        contrast: 0,
        temperature: 0,
        tint: 0,
        highlights: 0,
        shadows: 0,
      };

      let targetTrackId = null;
      for (let i = project.tracks.length - 1; i >= 0; i--) {
        const track = project.tracks[i];
        const isOverlap = track.clips.some(
          (c) =>
            newClip.startTime < c.startTime + c.duration &&
            newClip.startTime + newClip.duration > c.startTime
        );
        if (!isOverlap) {
          targetTrackId = track.id;
          break;
        }
      }

      if (!targetTrackId) {
        const newTrackId = `track_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const newTrack = {
          id: newTrackId,
          name: `Layer ${project.tracks.length + 1}`,
          order: project.tracks.length,
          visible: true,
          muted: false,
          clips: [newClip],
          audioSettings: {
            volumeLeft: 100,
            volumeRight: 100,
            muted: false,
            pitch: 0,
            eqLow: 0,
            eqMid: 0,
            eqHigh: 0,
          },
        };
        useProjectStore.setState((state) => ({
          project: {
            ...state.project,
            tracks: [...state.project.tracks, newTrack as any],
          },
        }));
      } else {
        if (addClipToTrack) addClipToTrack(targetTrackId, newClip);
      }
    } catch (err) {
    } finally {
      setAddingToTrackId(null);
    }
  };

  useEffect(() => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (
        window.AudioContext || (window as any).webkitAudioContext
      )();
    }
    const actx = audioCtxRef.current;

    project.tracks.forEach((track) => {
      track.clips.forEach((clip) => {
        if (!clip.fileUrl) return;
        if (!mediaElementsRef.current[clip.id]) {
          let media: HTMLVideoElement | HTMLAudioElement | HTMLImageElement;

          if (clip.type === "video") {
            const video = document.createElement("video");
            video.crossOrigin = "anonymous";
            video.src = clip.fileUrl;
            video.muted = false;
            video.playsInline = true;
            video.preload = "auto";
            media = video;
          } else if (clip.type === "audio") {
            const audio = document.createElement("audio");
            audio.crossOrigin = "anonymous";
            audio.src = clip.fileUrl;
            audio.muted = false;
            audio.preload = "auto";
            media = audio;
          } else {
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.onload = () => setForceRender({});
            img.src = clip.fileUrl;
            media = img;
          }
          mediaElementsRef.current[clip.id] = media;

          if (
            (clip.type === "video" || clip.type === "audio") &&
            !audioNodesRef.current[clip.id]
          ) {
            try {
              const source = actx.createMediaElementSource(
                media as HTMLMediaElement
              );

              const preGain = actx.createGain();
              preGain.channelCount = 2;
              preGain.channelCountMode = "explicit";

              const eqLow = actx.createBiquadFilter();
              eqLow.type = "lowshelf";
              eqLow.frequency.value = 320;
              const eqMid = actx.createBiquadFilter();
              eqMid.type = "peaking";
              eqMid.frequency.value = 1000;
              const eqHigh = actx.createBiquadFilter();
              eqHigh.type = "highshelf";
              eqHigh.frequency.value = 3200;

              const splitter = actx.createChannelSplitter(2);
              const merger = actx.createChannelMerger(2);

              const gainL = actx.createGain();
              const gainR = actx.createGain();

              source.connect(preGain);
              preGain.connect(eqLow);
              eqLow.connect(eqMid);
              eqMid.connect(eqHigh);
              eqHigh.connect(splitter);

              splitter.connect(gainL, 0);
              splitter.connect(gainR, 1);

              gainL.connect(merger, 0, 0);
              gainR.connect(merger, 0, 1);
              merger.connect(actx.destination);

              audioNodesRef.current[clip.id] = {
                gainL,
                gainR,
                eqLow,
                eqMid,
                eqHigh,
              };
            } catch (e) {
              console.warn(
                "Gagal merouting sumber audio untuk klip",
                clip.id,
                e
              );
            }
          }
        }
      });
    });
  }, [project.tracks]);

  const handleLeftMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingLeft.current = true;
    const onMouseMove = (ev: MouseEvent) => {
      if (isDraggingLeft.current)
        setLeftWidth(Math.min(320, Math.max(48, ev.clientX - 12)));
    };
    const onMouseUp = () => {
      isDraggingLeft.current = false;
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };
  
  const handleRightMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingRight.current = true;
    const onMouseMove = (ev: MouseEvent) => {
      if (isDraggingRight.current)
        setRightWidth(
          Math.min(480, Math.max(220, window.innerWidth - ev.clientX - 12))
        );
    };
    const onMouseUp = () => {
      isDraggingRight.current = false;
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  const handleApplyDuration = () => {
    const totalInSeconds = hours * 3600 + minutes * 60 + seconds + ms / 1000;
    if (totalInSeconds > 0 && setProjectDuration)
      setProjectDuration(totalInSeconds);
  };

  useEffect(() => {
    let animationFrameId: number;
    let lastTime = performance.now();

    const updatePlayhead = (now: number) => {
      const state = useProjectStore.getState();
      if (state.isPlaying) {
        const delta = Math.max(0, (now - lastTime) / 1000);
        const currentPos = state.project.currentTime;
        const nextTime = currentPos + delta;

        if (nextTime >= project.duration) {
          setCurrentTime(0);
          if (state.isPlaying && state.togglePlay) state.togglePlay();
        } else {
          setCurrentTime(nextTime);
        }
      }
      lastTime = now;
      if (useProjectStore.getState().isPlaying) {
        animationFrameId = requestAnimationFrame(updatePlayhead);
      }
    };

    if (isPlaying) {
      lastTime = performance.now();
      animationFrameId = requestAnimationFrame(updatePlayhead);
    }
    return () => cancelAnimationFrame(animationFrameId);
  }, [isPlaying, project.duration, setCurrentTime]);

  const drawMediaAspectFit = async (
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    media: HTMLVideoElement | HTMLImageElement,
    cw: number,
    ch: number,
    clip: MediaClip,
    renderTime: number,
    isOfflineRender: boolean = false
  ) => {
    const mw =
      media instanceof HTMLVideoElement
        ? media.videoWidth || 1080
        : media.naturalWidth || 1080;
    const mh =
      media instanceof HTMLVideoElement
        ? media.videoHeight || 1920
        : media.naturalHeight || 1920;
    if (mw === 0 || mh === 0) return;

    const currentClipTime = renderTime - clip.startTime;

    const isPosActive = (clip as any).animActive_position !== false;
    let offsetX = isPosActive ? getInterpolatedValue(currentClipTime, (clip as any).keyframes?.x, clip.x ?? 0) : (clip.x ?? 0);
    let offsetY = isPosActive ? getInterpolatedValue(currentClipTime, (clip as any).keyframes?.y, clip.y ?? 0) : (clip.y ?? 0);

    const isScaleActive = (clip as any).animActive_scale !== false;
    const customScale = isScaleActive ? getInterpolatedValue(currentClipTime, (clip as any).keyframes?.scale, clip.scale ?? 1.0) : (clip.scale ?? 1.0);

    const isRotActive = (clip as any).animActive_rotation !== false;
    const defaultRot = { x: 0, y: 0, z: 0 };
    const curRot = isRotActive ? getInterpolatedValue(currentClipTime, (clip as any).keyframes?.rotation, (clip as any).rotation || defaultRot) : (clip as any).rotation || defaultRot;

    const isOpActive = (clip as any).animActive_opacity !== false;
    const customOpacity = isOpActive ? getInterpolatedValue(currentClipTime, (clip as any).keyframes?.opacity, (clip as any).opacity ?? 100) : ((clip as any).opacity ?? 100);

    const customSat = clip.saturation ?? 100;
    const customVib = clip.vibrance ?? 0;
    const customCurves = clip.curves ?? 0;
    const customSharpen = clip.sharpen ?? 0;
    const customFaded = clip.fadedFilm ?? 0;

    const customBright = clip.brightness ?? 0;
    const customContrast = clip.contrast ?? 0;
    const customTemp = clip.temperature ?? 0;

    let filterArr = [];
    
    if (customSat !== 100) {
      filterArr.push(`saturate(${customSat}%)`);
    }
    if (customBright !== 0) {
      filterArr.push(`brightness(${100 + customBright}%)`);
    }
    if (customContrast !== 0) {
      filterArr.push(`contrast(${100 + customContrast}%)`);
    }
    if (customTemp !== 0) {
      if (customTemp > 0) filterArr.push(`sepia(${customTemp * 0.3}%)`);
      else filterArr.push(`hue-rotate(${customTemp * 0.5}deg)`);
    }
    if (customVib !== 0) {
      filterArr.push(`saturate(${100 + customVib * 1.5}%)`);
    }
    if (customCurves !== 0) {
      filterArr.push(`contrast(${100 + customCurves * 1.5}%)`);
    }
    if (customFaded > 0) {
      filterArr.push(`brightness(${100 + (customFaded * 0.2)}%)`);
      filterArr.push(`contrast(${100 - (customFaded * 0.4)}%)`);
      filterArr.push(`sepia(${customFaded * 0.5}%)`);
    }
    if (customSharpen > 0) {
      const pseudoSharpen = customSharpen * 0.6;
      filterArr.push(`contrast(${100 + pseudoSharpen}%)`);
    }

    if (isDraggingMedia.current && activeClipRef.current?.clip.id === clip.id) {
      offsetX = draggedTransform.current.x;
      offsetY = draggedTransform.current.y;
    }

    const scaleX_3D = Math.cos((curRot.y * Math.PI) / 180);
    const scaleY_3D = Math.cos((curRot.x * Math.PI) / 180);

    const baseScale = Math.min(cw / mw, ch / mh);
    const finalScale = baseScale * customScale;

    const w = mw * finalScale;
    const h = mh * finalScale;
    const x = (cw - w) / 2 + offsetX;
    const y = (ch - h) / 2 + offsetY;

    clipBoundsRef.current[clip.id] = { x, y, w, h };

    ctx.save();
    if (filterArr.length > 0) ctx.filter = filterArr.join(' ');
    ctx.globalAlpha = Math.max(0, Math.min(1, customOpacity / 100));
    ctx.translate(x + w / 2, y + h / 2);

    if (curRot.z !== 0) ctx.rotate((curRot.z * Math.PI) / 180);
    if (scaleX_3D !== 1 || scaleY_3D !== 1) ctx.scale(scaleX_3D, scaleY_3D);

    if (isOfflineRender && typeof createImageBitmap !== "undefined") {
      try {
        const bitmap = await createImageBitmap(media);
        ctx.drawImage(bitmap, -w / 2, -h / 2, w, h);
        bitmap.close(); 
      } catch (e) {
        ctx.drawImage(media, -w / 2, -h / 2, w, h);
      }
    } else {
      ctx.drawImage(media, -w / 2, -h / 2, w, h);
    }

    ctx.restore();

    if (clip.id === selectedClipId && !isOfflineRender) {
      ctx.save();
      ctx.strokeStyle = "#d8308f";
      ctx.lineWidth = 3;
      ctx.setLineDash([6, 6]);
      ctx.translate(x + w / 2, y + h / 2);
      if (curRot.z !== 0) ctx.rotate((curRot.z * Math.PI) / 180);
      if (scaleX_3D !== 1 || scaleY_3D !== 1) ctx.scale(scaleX_3D, scaleY_3D);
      ctx.strokeRect(-w / 2, -h / 2, w, h);
      ctx.restore();
    }
  };

  useEffect(() => {
    if (isExporting) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext("2d", { 
      alpha: false,               
      desynchronized: true,       
      willReadFrequently: false   
    });
    if (!ctx) return;

    if (canvas.width !== canvasWidth || canvas.height !== canvasHeight) {
      canvas.width = canvasWidth;
      canvas.height = canvasHeight;
    }

    ctx.fillStyle = "#060709";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (isPlaying && audioCtxRef.current?.state === "suspended") {
      audioCtxRef.current.resume();
    }

    project.tracks.forEach((track) => {
      const trackMuted = track.muted || (track.audioSettings?.muted ?? false);
      const volL = (track.audioSettings?.volumeLeft ?? 100) / 100;
      const volR = (track.audioSettings?.volumeRight ?? 100) / 100;

      const eqL = track.audioSettings?.eqLow ?? 0;
      const eqM = track.audioSettings?.eqMid ?? 0;
      const eqH = track.audioSettings?.eqHigh ?? 0;

      track.clips.forEach((clip) => {
        const media = mediaElementsRef.current[clip.id];
        const nodes = audioNodesRef.current[clip.id];

        if (
          media instanceof HTMLVideoElement ||
          media instanceof HTMLAudioElement
        ) {
          const clipEnd = clip.startTime + clip.duration;
          const isActive =
            project.currentTime >= clip.startTime &&
            project.currentTime <= clipEnd;

          if (isActive) {
            const clipElapsed = project.currentTime - clip.startTime;
            const targetTime = clip.sourceStart + clipElapsed;

            if (nodes) {
              nodes.gainL.gain.value = trackMuted ? 0 : volL;
              nodes.gainR.gain.value = trackMuted ? 0 : volR;

              nodes.eqLow.gain.value = eqL;
              nodes.eqMid.gain.value = eqM;
              nodes.eqHigh.gain.value = eqH;

              media.muted = false;
              media.volume = 1.0;
            } else {
              media.muted = trackMuted;
              media.volume = Math.max(0, Math.min(1, (volL + volR) / 2));
            }

            if (Math.abs(media.currentTime - targetTime) > 0.2 || !isPlaying)
              media.currentTime = targetTime;
            if (isPlaying) {
              if (media.paused) media.play().catch(() => {});
            } else {
              if (!media.paused) media.pause();
            }
          } else {
            if (!media.paused) media.pause();
          }
        }
      });
    });

    const tracksForRendering = [...project.tracks].reverse();
    tracksForRendering.forEach((track) => {
      if (track.visible === false) return;
      track.clips.forEach((clip) => {
        const clipEnd = clip.startTime + clip.duration;
        if (
          project.currentTime >= clip.startTime &&
          project.currentTime <= clipEnd
        ) {
          const media = mediaElementsRef.current[clip.id];
          if (media) {
            if (clip.type === "video" && media instanceof HTMLVideoElement) {
              drawMediaAspectFit(
                ctx,
                media,
                canvas.width,
                canvas.height,
                clip,
                project.currentTime,
                false
              );
            } else if (
              (clip.type === "image" || clip.type === "gif") &&
              media instanceof HTMLImageElement
            ) {
              if (media.complete && media.naturalWidth > 0)
                drawMediaAspectFit(
                  ctx,
                  media,
                  canvas.width,
                  canvas.height,
                  clip,
                  project.currentTime,
                  false
                );
            }
          }
        }
      });
    });
  }, [
    project.currentTime,
    project.tracks,
    project.width,
    project.height,
    fps,
    isPlaying,
    canvasWidth,
    canvasHeight,
    selectedClipId,
    isExporting,
  ]);

  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (audioCtxRef.current?.state === "suspended") {
      audioCtxRef.current.resume();
    }

    if (isPlaying) togglePlay();

    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const mouseX = (e.clientX - rect.left) * scaleX;
    const mouseY = (e.clientY - rect.top) * scaleY;

    for (const track of project.tracks) {
      if (track.visible === false) continue;
      for (const clip of track.clips) {
        if (
          project.currentTime >= clip.startTime &&
          project.currentTime <= clip.startTime + clip.duration
        ) {
          if (clip.type === "audio") continue;
          const bounds = clipBoundsRef.current[clip.id];
          if (bounds) {
            if (
              mouseX >= bounds.x &&
              mouseX <= bounds.x + bounds.w &&
              mouseY >= bounds.y &&
              mouseY <= bounds.y + bounds.h
            ) {
              isDraggingMedia.current = true;

              const currentClipTime = project.currentTime - clip.startTime;
              const isPosActive = (clip as any).animActive_position !== false;
              const currentX = isPosActive ? getInterpolatedValue(currentClipTime, (clip as any).keyframes?.x, clip.x ?? 0) : (clip.x ?? 0);
              const currentY = isPosActive ? getInterpolatedValue(currentClipTime, (clip as any).keyframes?.y, clip.y ?? 0) : (clip.y ?? 0);

              dragStartPos.current = {
                x: mouseX - currentX,
                y: mouseY - currentY,
              };
              draggedTransform.current = { x: currentX, y: currentY };

              activeClipRef.current = { trackId: track.id, clip };
              setSelectedClip(clip.id);
              return;
            }
          }
        }
      }
    }
    setSelectedClip(null);
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (
      !isDraggingMedia.current ||
      !activeClipRef.current ||
      !canvasRef.current
    )
      return;
    if (isPlaying) togglePlay();

    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const mouseX = (e.clientX - rect.left) * scaleX;
    const mouseY = (e.clientY - rect.top) * scaleY;

    const newX = mouseX - dragStartPos.current.x;
    const newY = mouseY - dragStartPos.current.y;

    draggedTransform.current = { x: newX, y: newY };
    setForceRender({});

    if (
      activeTab === "transform" &&
      selectedClipId === activeClipRef.current.clip.id
    ) {
      setPosX(Number(newX.toFixed(1)));
      setPosY(Number(newY.toFixed(1)));
    }
  };

  const handleCanvasMouseUp = () => {
    if (isDraggingMedia.current && activeClipRef.current) {
      const { trackId, clip } = activeClipRef.current;
      const finalX = draggedTransform.current.x;
      const finalY = draggedTransform.current.y;

      const localTime = project.currentTime - clip.startTime;
      const currentFrame = Math.round(localTime * fps);
      const exactLocalTime = currentFrame / fps;

      const isAnim =
        (clip as any).animActive_position !== false &&
        isAnimationEnabled("position");

      if (isAnim) {
        setClipKeyframe(trackId, clip.id, "x", exactLocalTime, finalX);
        setClipKeyframe(trackId, clip.id, "y", exactLocalTime, finalY);
      } else {
        updateClipTransform(trackId, clip.id, { x: finalX, y: finalY } as any);
      }
    }
    isDraggingMedia.current = false;
    activeClipRef.current = null;
  };

  const handleTransformChange = (prop: string, value: number) => {
    if (!selectedClipId) return;
    const track = project.tracks.find((t) =>
      t.clips.some((c) => c.id === selectedClipId)
    );
    if (!track) return;
    const clip = track.clips.find((c) => c.id === selectedClipId);
    if (!clip) return;

    const localTime = project.currentTime - clip.startTime;
    const currentFrame = Math.round(localTime * fps);
    const exactLocalTime = currentFrame / fps;

    const animGroup = prop === "x" || prop === "y" ? "position" : prop;
    const isAnim =
      (clip as any)[`animActive_${animGroup}`] !== false &&
      isAnimationEnabled(animGroup);

    if (isAnim) {
      setClipKeyframe(track.id, clip.id, prop as any, exactLocalTime, value);
    } else {
      updateClipTransform(track.id, clip.id, { [prop]: value } as any);
    }
  };

  const handleRotationChange = (axis: "x" | "y" | "z", val: number) => {
    if (!selectedClipId) return;
    const track = project.tracks.find((t) =>
      t.clips.some((c) => c.id === selectedClipId)
    );
    if (!track) return;
    const clip = track.clips.find((c) => c.id === selectedClipId);
    if (!clip) return;

    const localTime = project.currentTime - clip.startTime;
    const currentFrame = Math.round(localTime * fps);
    const exactLocalTime = currentFrame / fps;

    const isAnim =
      (clip as any).animActive_rotation !== false &&
      isAnimationEnabled("rotation");
    const currentRot = (clip as any).rotation || { x: 0, y: 0, z: 0 };

    if (isAnim) {
      const interpRot = getInterpolatedValue(
        exactLocalTime,
        (clip as any).keyframes?.rotation,
        currentRot
      );
      const newRot = { ...interpRot, [axis]: val };
      setClipKeyframe(track.id, clip.id, "rotation", exactLocalTime, newRot);
    } else {
      updateClipTransform(track.id, clip.id, {
        rotation: { ...currentRot, [axis]: val },
      });
    }
  };

  const isCompactLeft = leftWidth < 120;
  const formatFileSize = (bytes: number) => {
    if (!bytes || bytes === 0) return "Local Media File";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="w-full h-full flex items-center bg-[#0c0d10] p-1.5 overflow-hidden font-['USSO','Inter',sans-serif] relative">
      <input
        ref={mediaInputRef}
        type="file"
        multiple
        accept="image/*,video/*,audio/*"
        className="hidden"
        onChange={handleMediaImport}
      />

      <div
        style={{ width: `${leftWidth}px` }}
        className="h-full bg-[#13151c] border border-[#d8308f]/30 rounded-xl p-2 flex flex-col gap-1.5 shrink-0 relative overflow-y-auto transition-all select-none"
      >
        <div className="text-[10px] font-mono text-[#8a8f9e] border-b border-[#1f222e] pb-1.5 mb-1 font-bold truncate text-center">
          {isCompactLeft ? "//" : "// OPTIONS"}
        </div>

        <button
          title="Media Library"
          onClick={() => setActiveTab(activeTab === "media" ? null : "media")}
          className={`w-full py-2 px-2 rounded-lg flex items-center justify-between text-xs font-mono transition-colors cursor-pointer ${activeTab === "media" ? "bg-[#2d1b28] text-[#f48fb1] border border-[#d8308f]/60 font-bold" : "bg-[#181a24] text-[#8a8f9e] hover:text-[#e0e2e8] border border-[#2f3342]"}`}
        >
          <span className="flex items-center gap-2 mx-auto sm:mx-0">
            <FolderPlus className="w-4 h-4 text-[#f48fb1] shrink-0" />
            {!isCompactLeft && <span className="truncate">MEDIA LIBRARY</span>}
          </span>
          {!isCompactLeft && <span className="text-[10px]">›</span>}
        </button>

        <button
          title="Transform & Keyframes"
          onClick={() =>
            setActiveTab(activeTab === "transform" ? null : "transform")
          }
          className={`w-full py-2 px-2 rounded-lg flex items-center justify-between text-xs font-mono transition-colors cursor-pointer ${activeTab === "transform" ? "bg-[#2d1b28] text-[#f48fb1] border border-[#d8308f]/60 font-bold" : "bg-[#181a24] text-[#8a8f9e] hover:text-[#e0e2e8] border border-[#2f3342]"}`}
        >
          <span className="flex items-center gap-2 mx-auto sm:mx-0">
            <Maximize className="w-4 h-4 text-[#f48fb1] shrink-0" />
            {!isCompactLeft && <span className="truncate">TRANSFORM</span>}
          </span>
          {!isCompactLeft && <span className="text-[10px]">›</span>}
        </button>

        <button
          title="Video Effects"
          onClick={() =>
            setActiveTab(activeTab === "effects" ? null : "effects")
          }
          className={`w-full py-2 px-2 rounded-lg flex items-center justify-between text-xs font-mono transition-colors cursor-pointer ${activeTab === "effects" ? "bg-[#2d1b28] text-[#f48fb1] border border-[#d8308f]/60 font-bold" : "bg-[#181a24] text-[#8a8f9e] hover:text-[#e0e2e8] border border-[#2f3342]"}`}
        >
          <span className="flex items-center gap-2 mx-auto sm:mx-0">
            <Wand2 className="w-4 h-4 text-[#f48fb1] shrink-0" />
            {!isCompactLeft && <span className="truncate">VIDEO EFFECTS</span>}
          </span>
          {!isCompactLeft && <span className="text-[10px]">›</span>}
        </button>

        <button
          title="Coloring"
          onClick={() => setActiveTab(activeTab === "coloring" ? null : "coloring")}
          className={`w-full py-2 px-2 rounded-lg flex items-center justify-between text-xs font-mono transition-colors cursor-pointer ${activeTab === "coloring" ? "bg-[#2d1b28] text-[#f48fb1] border border-[#d8308f]/60 font-bold" : "bg-[#181a24] text-[#8a8f9e] hover:text-[#e0e2e8] border border-[#2f3342]"}`}
        >
          <span className="flex items-center gap-2 mx-auto sm:mx-0">
            <Palette className="w-4 h-4 text-[#f48fb1] shrink-0" />
            {!isCompactLeft && <span className="truncate">COLORING</span>}
          </span>
          {!isCompactLeft && <span className="text-[10px]">›</span>}
        </button>

        <button
          title="Text & Titles"
          onClick={() => setActiveTab(activeTab === "text" ? null : "text")}
          className={`w-full py-2 px-2 rounded-lg flex items-center justify-between text-xs font-mono transition-colors cursor-pointer ${activeTab === "text" ? "bg-[#2d1b28] text-[#f48fb1] border border-[#d8308f]/60 font-bold" : "bg-[#181a24] text-[#8a8f9e] hover:text-[#e0e2e8] border border-[#2f3342]"}`}
        >
          <span className="flex items-center gap-2 mx-auto sm:mx-0">
            <Type className="w-4 h-4 text-[#f48fb1] shrink-0" />
            {!isCompactLeft && <span className="truncate">TEXT & TITLES</span>}
          </span>
          {!isCompactLeft && <span className="text-[10px]">›</span>}
        </button>

        <button
          title="Audio Setting"
          onClick={() => setActiveTab(activeTab === "audio" ? null : "audio")}
          className={`w-full py-2 px-2 rounded-lg flex items-center justify-between text-xs font-mono transition-colors cursor-pointer ${activeTab === "audio" ? "bg-[#2d1b28] text-[#f48fb1] border border-[#d8308f]/60 font-bold" : "bg-[#181a24] text-[#8a8f9e] hover:text-[#e0e2e8] border border-[#2f3342]"}`}
        >
          <span className="flex items-center gap-2 mx-auto sm:mx-0">
            <Volume2 className="w-4 h-4 text-[#f48fb1] shrink-0" />
            {!isCompactLeft && <span className="truncate">AUDIO FX PER LAYER</span>}
          </span>
          {!isCompactLeft && <span className="text-[10px]">›</span>}
        </button>

        <button
          title="Set Max Duration"
          onClick={() =>
            setActiveTab(activeTab === "duration" ? null : "duration")
          }
          className={`w-full py-2 px-2 rounded-lg flex items-center justify-between text-xs font-mono transition-colors cursor-pointer ${activeTab === "duration" ? "bg-[#2d1b28] text-[#f48fb1] border border-[#d8308f]/60 font-bold" : "bg-[#181a24] text-[#8a8f9e] hover:text-[#e0e2e8] border border-[#2f3342]"}`}
        >
          <span className="flex items-center gap-2 mx-auto sm:mx-0">
            <Clock className="w-4 h-4 text-[#f48fb1] shrink-0" />
            {!isCompactLeft && <span className="truncate">SET DURATION</span>}
          </span>
          {!isCompactLeft && <span className="text-[10px]">›</span>}
        </button>

        <button
          title="Save & Export"
          onClick={() => setActiveTab(activeTab === "export" ? null : "export")}
          className={`w-full py-2 px-2 rounded-lg flex items-center justify-between text-xs font-mono transition-colors cursor-pointer mt-auto border ${
            activeTab === "export"
              ? "bg-[#d8308f] text-white border-[#f48fb1] font-bold shadow-[0_0_15px_rgba(216,48,143,0.4)]"
              : "bg-[#2d1b28] text-[#f48fb1] hover:bg-[#3d2035] border-[#d8308f]/60"
          }`}
        >
          <span className="flex items-center gap-2 mx-auto sm:mx-0">
            <Download
              className={`w-4 h-4 shrink-0 ${activeTab === "export" ? "text-white" : "text-[#f48fb1]"}`}
            />
            {!isCompactLeft && <span className="truncate">SAVE & EXPORT</span>}
          </span>
          {!isCompactLeft && <span className="text-[10px]">›</span>}
        </button>
      </div>

      <div
        onMouseDown={handleLeftMouseDown}
        className="w-1.5 h-full hover:bg-[#d8308f]/50 cursor-col-resize flex items-center justify-center transition-colors group z-20 shrink-0 mx-0.5"
      >
        <div className="w-0.5 h-8 bg-[#2f3342] group-hover:bg-[#d8308f] rounded" />
      </div>

      <div className="flex-1 h-full relative overflow-hidden bg-[#0c0d10] border border-[#d8308f]/30 rounded-xl flex items-center justify-center">
        <canvas
          ref={canvasRef}
          onMouseDown={handleCanvasMouseDown}
          onMouseMove={handleCanvasMouseMove}
          onMouseUp={handleCanvasMouseUp}
          onMouseLeave={handleCanvasMouseUp}
          className="w-full h-full object-contain rounded-lg bg-[#000000] cursor-move"
        />

        <div className="absolute top-3 right-3 flex items-center gap-2 bg-[#13151c]/90 px-3 py-1.5 rounded-lg border border-[#d8308f]/30 text-[10px] font-mono text-[#e0e2e8] backdrop-blur-md z-10">
          <span className="font-bold text-[#e571b6]">
            {project.currentTime.toFixed(2)}s /{" "}
            {Math.round(project.currentTime * fps)}f
          </span>
        </div>
      </div>

      {activeTab && (
        <div
          onMouseDown={handleRightMouseDown}
          className="w-1.5 h-full hover:bg-[#d8308f]/50 cursor-col-resize flex items-center justify-center transition-colors group z-20 shrink-0 mx-0.5"
        >
          <div className="w-0.5 h-8 bg-[#2f3342] group-hover:bg-[#d8308f] rounded" />
        </div>
      )}

      {activeTab && (
        <div
          style={{ width: `${rightWidth}px` }}
          className="h-full bg-[#13151c] border border-[#d8308f]/30 rounded-xl p-3 flex flex-col justify-between shrink-0 font-mono text-xs text-[#e0e2e8] overflow-y-auto"
        >
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex items-center justify-between border-b border-[#1f222e] pb-2 mb-3 shrink-0">
              <span className="font-bold text-[#f48fb1] tracking-wider uppercase text-[11px] truncate">
                {activeTab === "media" && "// MEDIA LIBRARY"}
                {activeTab === "effects" && "// VIDEO EFFECTS"}
                {activeTab === "coloring" && "// COLORING & COLOR GRADING"}
                {activeTab === "transform" && "// TRANSFORM & KEYFRAMES"}
                {activeTab === "text" && "// TEXT & TITLES"}
                {activeTab === "audio" && "// AUDIO FX (PER LAYER)"}
                {activeTab === "duration" && "// MAX DURATION"}
                {activeTab === "export" && "// SAVE & EXPORT"}
              </span>
              <button
                onClick={() => setActiveTab(null)}
                className="text-[#6e7382] hover:text-[#f48fb1] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {activeTab === "media" && (
              <div className="flex-1 flex flex-col gap-3 min-h-0">
                <button
                  disabled={isImporting}
                  onClick={() => mediaInputRef.current?.click()}
                  className="w-full py-2.5 px-3 bg-[#2d1b28] hover:bg-[#3d2035] disabled:bg-[#1a1219] disabled:text-[#6e7382] text-[#f48fb1] border border-[#d8308f]/60 rounded-lg font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer shrink-0"
                >
                  {isImporting ? (
                    <Loader2 className="w-4 h-4 animate-spin text-[#d8308f]" />
                  ) : (
                    <FolderPlus className="w-4 h-4" />
                  )}
                  <span>
                    {isImporting ? "IMPORTING..." : "IMPORT LOCAL MEDIA"}
                  </span>
                </button>

                {isImporting && (
                  <div className="bg-[#181a24] p-2.5 rounded-lg border border-[#d8308f]/40 space-y-1.5 shrink-0">
                    <div className="flex items-center justify-between text-[10px] font-bold">
                      <span className="text-[#f48fb1] truncate max-w-[170px]">
                        {importStatusText}
                      </span>
                      <span className="text-[#e571b6]">{importProgress}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-[#0c0d10] rounded-full overflow-hidden border border-[#2f3342]">
                      <div
                        className="h-full bg-gradient-to-r from-[#d8308f] to-[#f48fb1] transition-all duration-200"
                        style={{ width: `${importProgress}%` }}
                      />
                    </div>
                  </div>
                )}

                <div className="text-[10px] text-[#8a8f9e] font-bold flex items-center justify-between border-b border-[#1f222e] pb-1 shrink-0">
                  <span>IMPORTED FILES ({importedMediaList.length})</span>
                  <span className="text-[9px] text-[#6e7382]">
                    SAVED IN /MEDIA/
                  </span>
                </div>

                <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                  {importedMediaList.length === 0 ? (
                    <div className="h-40 flex flex-col items-center justify-center text-[#6e7382] border border-dashed border-[#2f3342] rounded-xl p-4 text-center">
                      <FolderPlus className="w-8 h-8 mb-2 text-[#404554]" />
                      <p className="text-[11px]">No media imported yet.</p>
                      <p className="text-[9px] text-[#404554] mt-1">
                        Files will be stored directly into your project's
                        /media/ subfolder.
                      </p>
                    </div>
                  ) : (
                    importedMediaList.map((item) => (
                      <div
                        key={item.id}
                        className="bg-[#181a24] p-2 rounded-xl border border-[#2f3342] hover:border-[#d8308f]/50 transition-colors flex items-center gap-2 group relative overflow-hidden"
                      >
                        <div className="w-12 h-12 bg-[#0c0d10] rounded-lg overflow-hidden border border-[#2f3342] flex items-center justify-center shrink-0">
                          {item.type === "image" && (
                            <img
                              src={item.dataUrl}
                              alt={item.name}
                              className="w-full h-full object-cover"
                            />
                          )}
                          {item.type === "video" && (
                            <video
                              src={item.dataUrl}
                              className="w-full h-full object-cover"
                            />
                          )}
                          {item.type === "audio" && (
                            <Music className="w-5 h-5 text-[#f48fb1]" />
                          )}
                        </div>

                        <div className="flex-1 overflow-hidden">
                          <p
                            className="text-xs text-[#e0e2e8] font-bold truncate"
                            title={item.name}
                          >
                            {item.name}
                          </p>
                          <div className="flex items-center gap-2 text-[9px] text-[#8a8f9e] mt-0.5 font-mono">
                            <span className="uppercase text-[#e571b6] font-bold flex items-center gap-1">
                              {item.type === "image" && (
                                <ImageIcon className="w-3 h-3" />
                              )}
                              {item.type === "video" && (
                                <Film className="w-3 h-3" />
                              )}
                              {item.type === "audio" && (
                                <Music className="w-3 h-3" />
                              )}
                              {item.type}
                            </span>
                            <span>•</span>
                            <span>{formatFileSize(item.size)}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            disabled={addingToTrackId === item.id}
                            onClick={() => handleAddToTimeline(item)}
                            className="p-1.5 rounded bg-[#2a1826] hover:bg-[#3d1f38] disabled:opacity-50 text-[#f48fb1] border border-[#d8308f]/40 transition-colors cursor-pointer"
                          >
                            {addingToTrackId === item.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Plus className="w-3.5 h-3.5" />
                            )}
                          </button>
                          <button
                            onClick={(e) => handleDeleteMedia(item.id, e)}
                            className="p-1.5 rounded bg-[#2d1822] hover:bg-[#4a1823] text-[#f48fb1] border border-[#d8308f]/30 transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {activeTab === "transform" && (
              <div className="space-y-1 font-['Inter',sans-serif]">
                <div className="flex items-center justify-between text-[11px] text-[#e0e2e8] mb-2 px-1">
                  <div className="flex items-center gap-1 cursor-pointer select-none">
                    <ChevronDown className="w-3.5 h-3.5" />
                    <span className="font-bold">Transform</span>
                  </div>
                </div>

                <div className="flex items-center justify-between hover:bg-[#1f222e] px-1 py-1 rounded cursor-default group transition-colors">
                  <div className="flex items-center gap-2 pl-4">
                    <Diamond
                      onClick={() => handleToggleAnimation("position")}
                      className={`w-3.5 h-3.5 cursor-pointer transition-colors ${isAnimationEnabled("position") ? "text-[#f48fb1] fill-[#f48fb1]" : "text-[#6e7382] hover:text-[#e0e2e8] fill-transparent"}`}
                    />
                    <span className="text-[11px] text-[#e0e2e8]">Position</span>
                  </div>
                  <div className="flex items-center text-[#f48fb1] text-[11px] font-mono">
                    <input
                      type="text"
                      className="bg-transparent w-10 text-right outline-none cursor-ew-resize text-[#f48fb1]"
                      value={posX}
                      onChange={(e) => {
                        const valX = Number(e.target.value);
                        if (!isNaN(valX)) {
                          setPosX(valX);
                          handleTransformChange("x", valX);
                        }
                      }}
                    />
                    <span className="mx-0.5 opacity-50">,</span>
                    <input
                      type="text"
                      className="bg-transparent w-10 text-left outline-none cursor-ew-resize text-[#f48fb1]"
                      value={posY}
                      onChange={(e) => {
                        const valY = Number(e.target.value);
                        if (!isNaN(valY)) {
                          setPosY(valY);
                          handleTransformChange("y", valY);
                        }
                      }}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between hover:bg-[#1f222e] px-1 py-1 rounded cursor-default group transition-colors">
                  <div className="flex items-center gap-2 pl-4">
                    <Diamond
                      onClick={() => handleToggleAnimation("scale")}
                      className={`w-3.5 h-3.5 cursor-pointer transition-colors ${isAnimationEnabled("scale") ? "text-[#f48fb1] fill-[#f48fb1]" : "text-[#6e7382] hover:text-[#e0e2e8] fill-transparent"}`}
                    />
                    <Link2 className="w-3 h-3 text-[#e0e2e8] cursor-pointer" />
                    <span className="text-[11px] text-[#e0e2e8]">Scale</span>
                  </div>
                  <div className="flex items-center text-[#f48fb1] text-[11px] font-mono">
                    <input
                      type="text"
                      className="bg-transparent w-12 text-right outline-none cursor-ew-resize text-[#f48fb1]"
                      value={scaleV}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        if (!isNaN(val)) {
                          setScaleV(val);
                          handleTransformChange("scale", val / 100);
                        }
                      }}
                    />
                    <span className="text-[#8a8f9e] ml-0.5">%</span>
                  </div>
                </div>

                <div className="flex items-center justify-between hover:bg-[#1f222e] px-1 py-1 rounded cursor-default group transition-colors">
                  <div className="flex items-center gap-2 pl-4 shrink-0">
                    <Diamond
                      onClick={() => handleToggleAnimation("rotation")}
                      className={`w-3.5 h-3.5 cursor-pointer transition-colors ${isAnimationEnabled("rotation") ? "text-[#f48fb1] fill-[#f48fb1]" : "text-[#6e7382] hover:text-[#e0e2e8] fill-transparent"}`}
                    />
                    <span className="text-[11px] text-[#e0e2e8]">Rotation</span>
                  </div>
                  <div className="flex items-center text-[#f48fb1] text-[11px] font-mono gap-0.5">
                    <input
                      type="text"
                      title="Rotation X"
                      className="bg-transparent w-7 text-right outline-none cursor-ew-resize text-[#f48fb1]"
                      value={rotationX}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        if (!isNaN(val)) {
                          setRotationX(val);
                          handleRotationChange("x", val);
                        }
                      }}
                    />
                    <span className="opacity-50">,</span>
                    <input
                      type="text"
                      title="Rotation Y"
                      className="bg-transparent w-7 text-center outline-none cursor-ew-resize text-[#f48fb1]"
                      value={rotationY}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        if (!isNaN(val)) {
                          setRotationY(val);
                          handleRotationChange("y", val);
                        }
                      }}
                    />
                    <span className="opacity-50">,</span>
                    <input
                      type="text"
                      title="Rotation Z"
                      className="bg-transparent w-7 text-left outline-none cursor-ew-resize text-[#f48fb1]"
                      value={rotationZ}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        if (!isNaN(val)) {
                          setRotationZ(val);
                          handleRotationChange("z", val);
                        }
                      }}
                    />
                    <span className="text-[#8a8f9e] ml-0.5">°</span>
                  </div>
                </div>

                <div className="flex flex-col hover:bg-[#1f222e] px-1 py-1 rounded cursor-default group transition-colors gap-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 pl-4">
                      <Diamond
                        onClick={() => handleToggleAnimation("opacity")}
                        className={`w-3.5 h-3.5 cursor-pointer transition-colors ${isAnimationEnabled("opacity") ? "text-[#f48fb1] fill-[#f48fb1]" : "text-[#6e7382] hover:text-[#e0e2e8] fill-transparent"}`}
                      />
                      <span className="text-[11px] text-[#e0e2e8]">
                        Opacity
                      </span>
                    </div>
                    <div className="flex items-center text-[#f48fb1] text-[11px] font-mono">
                      <input
                        type="text"
                        className="bg-transparent w-10 text-right outline-none cursor-ew-resize text-[#f48fb1]"
                        value={opacityV}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          if (!isNaN(val)) {
                            const clamped = Math.max(0, Math.min(100, val));
                            setOpacityV(clamped);
                            handleTransformChange("opacity", clamped);
                          }
                        }}
                      />
                      <span className="text-[#8a8f9e] ml-0.5">%</span>
                    </div>
                  </div>
                  <div className="pl-9 pr-1">
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={opacityV}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        setOpacityV(val);
                        handleTransformChange("opacity", val);
                      }}
                      className="w-full h-1 bg-[#0c0d10] rounded-lg appearance-none cursor-pointer accent-[#d8308f]"
                    />
                  </div>
                </div>

                {!selectedClipId && (
                  <div className="mt-4 p-3 rounded-lg border border-dashed border-[#2f3342] text-center text-[#6e7382]">
                    <p className="text-[10px] font-bold">NO LAYER SELECTED</p>
                    <p className="text-[9px] mt-1">
                      Select a media to apply transforms.
                    </p>
                  </div>
                )}
              </div>
            )}

            {activeTab === "coloring" && (
              <div className="space-y-3 font-['Inter',sans-serif] bg-[#13151c] rounded-lg border border-[#d8308f]/30 p-2 h-full overflow-y-auto">
                <div className="flex items-center justify-between text-[11px] text-[#e0e2e8] px-1 py-1 border-b border-[#1f222e]">
                  <div className="flex items-center gap-1 select-none font-bold">
                    <Palette className="w-3.5 h-3.5 text-[#f48fb1]" />
                    <span className="text-[#f48fb1]">Color Grading</span>
                  </div>
                  <span className="text-[10px] text-[#8a8f9e]">
                    {selectedClipId ? "Active Clip" : "No Clip Selected"}
                  </span>
                </div>

                {selectedClipId ? (
                  <div className="space-y-3">
                    <div className="flex flex-col gap-1">
                      <div className="flex justify-between text-[10px] text-[#e0e2e8]">
                        <span>Brightness</span>
                        <span className="text-[#f48fb1] font-mono">{brightnessV}</span>
                      </div>
                      <input
                        type="range"
                        min="-100"
                        max="100"
                        value={brightnessV}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setBrightnessV(val);
                          handleTransformChange("brightness", val);
                        }}
                        className="w-full h-1 bg-[#0c0d10] rounded-lg appearance-none cursor-pointer accent-[#d8308f]"
                      />
                    </div>

                    <div className="flex flex-col gap-1">
                      <div className="flex justify-between text-[10px] text-[#e0e2e8]">
                        <span>Contrast</span>
                        <span className="text-[#f48fb1] font-mono">{contrastV}</span>
                      </div>
                      <input
                        type="range"
                        min="-100"
                        max="100"
                        value={contrastV}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setContrastV(val);
                          handleTransformChange("contrast", val);
                        }}
                        className="w-full h-1 bg-[#0c0d10] rounded-lg appearance-none cursor-pointer accent-[#d8308f]"
                      />
                    </div>

                    <div className="flex flex-col gap-1">
                      <div className="flex justify-between text-[10px] text-[#e0e2e8]">
                        <span>Temperature</span>
                        <span className="text-[#f48fb1] font-mono">{temperatureV}</span>
                      </div>
                      <input
                        type="range"
                        min="-100"
                        max="100"
                        value={temperatureV}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setTemperatureV(val);
                          handleTransformChange("temperature", val);
                        }}
                        className="w-full h-1 bg-[#0c0d10] rounded-lg appearance-none cursor-pointer accent-[#d8308f]"
                      />
                    </div>

                    <div className="flex flex-col gap-1">
                      <div className="flex justify-between text-[10px] text-[#e0e2e8]">
                        <span>Tint</span>
                        <span className="text-[#f48fb1] font-mono">{tintV}</span>
                      </div>
                      <input
                        type="range"
                        min="-100"
                        max="100"
                        value={tintV}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setTintV(val);
                          handleTransformChange("tint", val);
                        }}
                        className="w-full h-1 bg-[#0c0d10] rounded-lg appearance-none cursor-pointer accent-[#d8308f]"
                      />
                    </div>

                    <div className="flex flex-col gap-1">
                      <div className="flex justify-between text-[10px] text-[#e0e2e8]">
                        <span>Highlights</span>
                        <span className="text-[#f48fb1] font-mono">{highlightsV}</span>
                      </div>
                      <input
                        type="range"
                        min="-100"
                        max="100"
                        value={highlightsV}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setHighlightsV(val);
                          handleTransformChange("highlights", val);
                        }}
                        className="w-full h-1 bg-[#0c0d10] rounded-lg appearance-none cursor-pointer accent-[#d8308f]"
                      />
                    </div>

                    <div className="flex flex-col gap-1">
                      <div className="flex justify-between text-[10px] text-[#e0e2e8]">
                        <span>Shadows</span>
                        <span className="text-[#f48fb1] font-mono">{shadowsV}</span>
                      </div>
                      <input
                        type="range"
                        min="-100"
                        max="100"
                        value={shadowsV}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setShadowsV(val);
                          handleTransformChange("shadows", val);
                        }}
                        className="w-full h-1 bg-[#0c0d10] rounded-lg appearance-none cursor-pointer accent-[#d8308f]"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 p-4 rounded-lg border border-dashed border-[#2f3342] text-center text-[#6e7382]">
                    <p className="text-[10px] font-bold text-[#8a8f9e]">NO CLIP SELECTED</p>
                    <p className="text-[9px] mt-1.5">Select a media clip in the timeline to apply color grading.</p>
                  </div>
                )}
              </div>
            )}

            {activeTab === "effects" && (
              <div className="space-y-4 font-['Inter',sans-serif]">
                <div className="flex items-center justify-between text-[11px] text-[#e0e2e8] px-1">
                  <div className="flex items-center gap-1 select-none">
                    <Wand2 className="w-3.5 h-3.5 text-[#f48fb1]" />
                    <span className="font-bold tracking-wider">Video Effect</span>
                  </div>
                </div>

                {selectedClipId ? (
                  <div className="space-y-3">
                    <div className="bg-[#181a24] rounded-lg border border-[#2f3342] overflow-hidden">
                      <div className="bg-[#1f222e] px-3 py-2 border-b border-[#2f3342]">
                        <span className="text-[10px] font-bold text-[#8a8f9e] tracking-wider">BASIC CORRECTION</span>
                      </div>
                      
                      <div className="p-2 space-y-3">
                        <div className="flex flex-col gap-1 group">
                          <div className="flex items-center justify-between px-1">
                            <div className="flex items-center gap-2">
                              <Diamond onClick={() => handleToggleAnimation("saturation")} className={`w-3 h-3 cursor-pointer transition-colors ${isAnimationEnabled("saturation") ? "text-[#f48fb1] fill-[#f48fb1]" : "text-[#6e7382] hover:text-[#e0e2e8] fill-transparent"}`} />
                              <span className="text-[10px] text-[#e0e2e8]">Saturation</span>
                            </div>
                            <div className="flex items-center text-[#f48fb1] text-[10px] font-mono">
                              <input type="number" className="bg-transparent w-10 text-right outline-none text-[#f48fb1]" value={saturationV} onChange={(e) => { const v=Number(e.target.value); setSaturationV(v); handleTransformChange('saturation', v); }} />
                            </div>
                          </div>
                          <input type="range" min="0" max="200" value={saturationV} onChange={(e)=>{ const v=Number(e.target.value); setSaturationV(v); handleTransformChange('saturation', v); }} className="w-full h-1 bg-[#0c0d10] rounded-lg appearance-none cursor-pointer accent-[#d8308f]" />
                        </div>

                        <div className="flex flex-col gap-1 group">
                          <div className="flex items-center justify-between px-1">
                            <div className="flex items-center gap-2">
                              <Diamond onClick={() => handleToggleAnimation("vibrance")} className={`w-3 h-3 cursor-pointer transition-colors ${isAnimationEnabled("vibrance") ? "text-[#f48fb1] fill-[#f48fb1]" : "text-[#6e7382] hover:text-[#e0e2e8] fill-transparent"}`} />
                              <span className="text-[10px] text-[#e0e2e8]">Vibrance</span>
                            </div>
                            <div className="flex items-center text-[#f48fb1] text-[10px] font-mono">
                              <input type="number" className="bg-transparent w-10 text-right outline-none text-[#f48fb1]" value={vibranceV} onChange={(e) => { const v=Number(e.target.value); setVibranceV(v); handleTransformChange('vibrance', v); }} />
                            </div>
                          </div>
                          <input type="range" min="-100" max="100" value={vibranceV} onChange={(e)=>{ const v=Number(e.target.value); setVibranceV(v); handleTransformChange('vibrance', v); }} className="w-full h-1 bg-[#0c0d10] rounded-lg appearance-none cursor-pointer accent-[#d8308f]" />
                        </div>

                        <div className="flex flex-col gap-1 group">
                          <div className="flex items-center justify-between px-1">
                            <div className="flex items-center gap-2">
                              <Diamond onClick={() => handleToggleAnimation("curves")} className={`w-3 h-3 cursor-pointer transition-colors ${isAnimationEnabled("curves") ? "text-[#f48fb1] fill-[#f48fb1]" : "text-[#6e7382] hover:text-[#e0e2e8] fill-transparent"}`} />
                              <span className="text-[10px] text-[#e0e2e8]">Contrast</span>
                            </div>
                            <div className="flex items-center text-[#f48fb1] text-[10px] font-mono">
                              <input type="number" className="bg-transparent w-10 text-right outline-none text-[#f48fb1]" value={curvesV} onChange={(e) => { const v=Number(e.target.value); setCurvesV(v); handleTransformChange('curves', v); }} />
                            </div>
                          </div>
                          <input type="range" min="-100" max="100" value={curvesV} onChange={(e)=>{ const v=Number(e.target.value); setCurvesV(v); handleTransformChange('curves', v); }} className="w-full h-1 bg-[#0c0d10] rounded-lg appearance-none cursor-pointer accent-[#d8308f]" />
                        </div>
                      </div>
                    </div>

                    <div className="bg-[#181a24] rounded-lg border border-[#2f3342] overflow-hidden">
                      <div className="bg-[#1f222e] px-3 py-2 border-b border-[#2f3342]">
                        <span className="text-[10px] font-bold text-[#8a8f9e] tracking-wider">CREATIVE</span>
                      </div>
                      
                      <div className="p-2 space-y-3">
                        <div className="flex flex-col gap-1 group">
                          <div className="flex items-center justify-between px-1">
                            <div className="flex items-center gap-2">
                              <Diamond onClick={() => handleToggleAnimation("sharpen")} className={`w-3 h-3 cursor-pointer transition-colors ${isAnimationEnabled("sharpen") ? "text-[#f48fb1] fill-[#f48fb1]" : "text-[#6e7382] hover:text-[#e0e2e8] fill-transparent"}`} />
                              <span className="text-[10px] text-[#e0e2e8]">Sharpen</span>
                            </div>
                            <div className="flex items-center text-[#f48fb1] text-[10px] font-mono">
                              <input type="number" className="bg-transparent w-10 text-right outline-none text-[#f48fb1]" value={sharpenV} onChange={(e) => { const v=Number(e.target.value); setSharpenV(v); handleTransformChange('sharpen', v); }} />
                            </div>
                          </div>
                          <input type="range" min="0" max="100" value={sharpenV} onChange={(e)=>{ const v=Number(e.target.value); setSharpenV(v); handleTransformChange('sharpen', v); }} className="w-full h-1 bg-[#0c0d10] rounded-lg appearance-none cursor-pointer accent-[#d8308f]" />
                        </div>

                        <div className="flex flex-col gap-1 group">
                          <div className="flex items-center justify-between px-1">
                            <div className="flex items-center gap-2">
                              <Diamond onClick={() => handleToggleAnimation("fadedFilm")} className={`w-3 h-3 cursor-pointer transition-colors ${isAnimationEnabled("fadedFilm") ? "text-[#f48fb1] fill-[#f48fb1]" : "text-[#6e7382] hover:text-[#e0e2e8] fill-transparent"}`} />
                              <span className="text-[10px] text-[#e0e2e8]">Faded Film</span>
                            </div>
                            <div className="flex items-center text-[#f48fb1] text-[10px] font-mono">
                              <input type="number" className="bg-transparent w-10 text-right outline-none text-[#f48fb1]" value={fadedFilmV} onChange={(e) => { const v=Number(e.target.value); setFadedFilmV(v); handleTransformChange('fadedFilm', v); }} />
                            </div>
                          </div>
                          <input type="range" min="0" max="100" value={fadedFilmV} onChange={(e)=>{ const v=Number(e.target.value); setFadedFilmV(v); handleTransformChange('fadedFilm', v); }} className="w-full h-1 bg-[#0c0d10] rounded-lg appearance-none cursor-pointer accent-[#d8308f]" />
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 p-4 rounded-lg border border-dashed border-[#2f3342] text-center text-[#6e7382]">
                    <p className="text-[10px] font-bold text-[#8a8f9e]">NO LAYER SELECTED</p>
                    <p className="text-[9px] mt-1.5">Select a media clip in the timeline to apply color correction and effects.</p>
                  </div>
                )}
              </div>
            )}

            {activeTab === "text" && (
              <div className="space-y-3">
                <div className="text-[10px] text-[#8a8f9e]">
                  OVERLAY TEXT GENERATOR:
                </div>
                <button className="w-full py-2 bg-[#2d1b28] hover:bg-[#3d2035] text-[#f48fb1] border border-[#d8308f]/60 rounded-lg font-bold">
                  + ADD TEXT LAYER
                </button>
              </div>
            )}

            {activeTab === "audio" && (
              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] text-[#8a8f9e] font-bold mb-1 flex items-center gap-1">
                    <Layers className="w-3.5 h-3.5 text-[#f48fb1]" />
                    <span>SELECT LAYER TARGET:</span>
                  </label>
                  <select
                    value={activeTrack?.id || ""}
                    onChange={(e) => setSelectedTrack(e.target.value)}
                    className="w-full bg-[#181a24] border border-[#d8308f]/50 rounded px-2 py-1.5 text-xs text-[#e0e2e8] font-bold outline-none cursor-pointer"
                  >
                    {project.tracks.map((t, idx) => (
                      <option key={t.id} value={t.id}>
                        {t.name || `Layer ${idx + 1}`}
                      </option>
                    ))}
                  </select>
                </div>

                {activeTrack && (
                  <>
                    <div className="space-y-2 pt-2 border-t border-[#1f222e]">
                      <div className="text-[10px] text-[#8a8f9e] font-bold">
                        INDEPENDENT GAIN (L/R):
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="bg-[#181a24] p-2 rounded-lg border border-[#2f3342]">
                          <div className="flex justify-between text-[10px] mb-1 font-bold">
                            <span className="text-[#f48fb1]">LEFT</span>
                            <span className="text-[#e571b6]">
                              {trackAudio.volumeLeft}%
                            </span>
                          </div>
                          <input
                            type="range"
                            min="0"
                            max="100"
                            value={trackAudio.volumeLeft}
                            onChange={(e) =>
                              updateTrackAudioSettings(activeTrack.id, {
                                volumeLeft: Number(e.target.value),
                              })
                            }
                            className="w-full h-1.5 bg-[#0c0d10] rounded-lg appearance-none cursor-pointer accent-[#d8308f]"
                          />
                        </div>
                        <div className="bg-[#181a24] p-2 rounded-lg border border-[#2f3342]">
                          <div className="flex justify-between text-[10px] mb-1 font-bold">
                            <span className="text-[#f48fb1]">RIGHT</span>
                            <span className="text-[#e571b6]">
                              {trackAudio.volumeRight}%
                            </span>
                          </div>
                          <input
                            type="range"
                            min="0"
                            max="100"
                            value={trackAudio.volumeRight}
                            onChange={(e) =>
                              updateTrackAudioSettings(activeTrack.id, {
                                volumeRight: Number(e.target.value),
                              })
                            }
                            className="w-full h-1.5 bg-[#0c0d10] rounded-lg appearance-none cursor-pointer accent-[#d8308f]"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2 pt-2 border-t border-[#1f222e]">
                      <div className="text-[10px] text-[#8a8f9e] font-bold flex items-center gap-1">
                        <Sliders className="w-3.5 h-3.5 text-[#f48fb1]" />
                        <span>LAYER EFFECTS (PITCH & EQ):</span>
                      </div>
                      <div className="bg-[#181a24] p-2 rounded-lg border border-[#2f3342]">
                        <div className="flex justify-between text-[10px] mb-1 font-bold">
                          <span>PITCH SHIFT</span>
                          <span className="text-[#f48fb1]">
                            {trackAudio.pitch > 0
                              ? `+${trackAudio.pitch}`
                              : trackAudio.pitch}{" "}
                            st
                          </span>
                        </div>
                        <input
                          type="range"
                          min="-12"
                          max="12"
                          value={trackAudio.pitch}
                          onChange={(e) =>
                            updateTrackAudioSettings(activeTrack.id, {
                              pitch: Number(e.target.value),
                            })
                          }
                          className="w-full h-1.5 bg-[#0c0d10] rounded-lg appearance-none cursor-pointer accent-[#d8308f]"
                        />
                      </div>
                      <div className="grid grid-cols-3 gap-1.5">
                        <div className="bg-[#181a24] p-1.5 rounded border border-[#2f3342] text-center">
                          <span className="text-[9px] text-[#8a8f9e] font-bold block">
                            LOW
                          </span>
                          <span className="text-[10px] text-[#e571b6] font-bold">
                            {trackAudio.eqLow}dB
                          </span>
                          <input
                            type="range"
                            min="-12"
                            max="12"
                            value={trackAudio.eqLow}
                            onChange={(e) =>
                              updateTrackAudioSettings(activeTrack.id, {
                                eqLow: Number(e.target.value),
                              })
                            }
                            className="w-full h-1 bg-[#0c0d10] appearance-none cursor-pointer accent-[#d8308f]"
                          />
                        </div>
                        <div className="bg-[#181a24] p-1.5 rounded border border-[#2f3342] text-center">
                          <span className="text-[9px] text-[#8a8f9e] font-bold block">
                            MID
                          </span>
                          <span className="text-[10px] text-[#e571b6] font-bold">
                            {trackAudio.eqMid}dB
                          </span>
                          <input
                            type="range"
                            min="-12"
                            max="12"
                            value={trackAudio.eqMid}
                            onChange={(e) =>
                              updateTrackAudioSettings(activeTrack.id, {
                                eqMid: Number(e.target.value),
                              })
                            }
                            className="w-full h-1 bg-[#0c0d10] appearance-none cursor-pointer accent-[#d8308f]"
                          />
                        </div>
                        <div className="bg-[#181a24] p-1.5 rounded border border-[#2f3342] text-center">
                          <span className="text-[9px] text-[#8a8f9e] font-bold block">
                            HIGH
                          </span>
                          <span className="text-[10px] text-[#e571b6] font-bold">
                            {trackAudio.eqHigh}dB
                          </span>
                          <input
                            type="range"
                            min="-12"
                            max="12"
                            value={trackAudio.eqHigh}
                            onChange={(e) =>
                              updateTrackAudioSettings(activeTrack.id, {
                                eqHigh: Number(e.target.value),
                              })
                            }
                            className="w-full h-1 bg-[#0c0d10] appearance-none cursor-pointer accent-[#d8308f]"
                          />
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {activeTab === "duration" && (
              <div className="space-y-3">
                <div className="text-[10px] text-[#8a8f9e]">
                  TIMELINE BOUNDS:
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[9px] text-[#6e7382] mb-0.5 font-bold">
                      HOURS
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={hours}
                      onChange={(e) =>
                        setHours(Math.max(0, Number(e.target.value)))
                      }
                      className="w-full px-2 py-1 bg-[#181a24] border border-[#2f3342] rounded text-[#e0e2e8] focus:border-[#d8308f] outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] text-[#6e7382] mb-0.5 font-bold">
                      MINUTES
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="59"
                      value={minutes}
                      onChange={(e) =>
                        setMinutes(
                          Math.max(0, Math.min(59, Number(e.target.value)))
                        )
                      }
                      className="w-full px-2 py-1 bg-[#181a24] border border-[#2f3342] rounded text-[#e0e2e8] focus:border-[#d8308f] outline-none"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[9px] text-[#6e7382] mb-0.5 font-bold">
                      SECONDS
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="59"
                      value={seconds}
                      onChange={(e) =>
                        setSeconds(
                          Math.max(0, Math.min(59, Number(e.target.value)))
                        )
                      }
                      className="w-full px-2 py-1 bg-[#181a24] border border-[#2f3342] rounded text-[#e0e2e8] focus:border-[#d8308f] outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] text-[#6e7382] mb-0.5 font-bold">
                      MS
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="999"
                      step="10"
                      value={ms}
                      onChange={(e) =>
                        setMs(
                          Math.max(0, Math.min(999, Number(e.target.value)))
                        )
                      }
                      className="w-full px-2 py-1 bg-[#181a24] border border-[#2f3342] rounded text-[#e0e2e8] focus:border-[#d8308f] outline-none"
                    />
                  </div>
                </div>
                <div className="pt-2 border-t border-[#1f222e]">
                  <button
                    onClick={handleApplyDuration}
                    className="w-full py-1.5 bg-[#2d1b28] hover:bg-[#3d2035] text-[#f48fb1] border border-[#d8308f]/60 rounded font-bold cursor-pointer transition-colors"
                  >
                    APPLY DURATION
                  </button>
                </div>
              </div>
            )}

            {activeTab === "export" && (
              <div className="space-y-4">
                <div className="bg-[#181a24] p-3 rounded-lg border border-[#2f3342] space-y-2">
                  <div className="flex items-center gap-2 text-[#8a8f9e]">
                    <Save className="w-4 h-4 text-[#f48fb1]" />
                    <span className="text-[10px] font-bold">
                      SAVE EDITING STATE
                    </span>
                  </div>
                  <p className="text-[9px] text-[#6e7382]">
                    Saves the current keyframes, layers, and project state to
                    your local storage and project folder.
                  </p>
                  <button
                    onClick={handleSaveProject}
                    disabled={isExporting}
                    className="w-full py-2 bg-[#2d1b28] hover:bg-[#3d2035] disabled:opacity-50 text-[#f48fb1] border border-[#d8308f]/60 rounded-lg font-bold transition-colors cursor-pointer text-xs"
                  >
                    SAVE PROJECT
                  </button>
                </div>

                <div className="bg-[#181a24] p-3 rounded-lg border border-[#2f3342] space-y-3">
                  <div className="flex items-center gap-2 text-[#8a8f9e]">
                    <Video className="w-4 h-4 text-[#f48fb1]" />
                    <span className="text-[10px] font-bold">
                      SAVE & EXPORT MEDIA
                    </span>
                  </div>

                  <div>
                    <label className="block text-[9px] text-[#6e7382] mb-1 font-bold">
                      EXPORT FORMAT
                    </label>
                    <select
                      value={exportFormat}
                      onChange={(e) => {
                        const val = e.target.value;
                        setExportFormat(val);
                        // Matikan webcodecs jika pilih GIF
                        if (val === "gif" && exportEngine === "webcodecs") {
                          setExportEngine("ffmpeg");
                        }
                      }}
                      disabled={isExporting}
                      className="w-full bg-[#0c0d10] border border-[#d8308f]/50 rounded px-2 py-1.5 text-xs text-[#e0e2e8] font-bold outline-none cursor-pointer"
                    >
                      <option value="mp4">MP4 Video (H.264)</option>
                      <option value="webm">WEBM Video</option>
                      <option value="gif">GIF Animated</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[9px] text-[#6e7382] mb-1 font-bold">
                      EXPORT ENGINE
                    </label>
                    <select
                      value={exportEngine}
                      onChange={(e) => setExportEngine(e.target.value as "ffmpeg" | "webcodecs")}
                      disabled={isExporting || exportFormat === "gif"}
                      className="w-full bg-[#0c0d10] border border-[#d8308f]/50 rounded px-2 py-1.5 text-xs text-[#e0e2e8] font-bold outline-none cursor-pointer disabled:opacity-50"
                    >
                      <option value="webcodecs">WebGL WebCodecs API (GPU Accelerated)</option>
                      <option value="ffmpeg">FFmpeg WASM (CPU Render & Encode)</option>
                    </select>
                  </div>

                  <button
                    onClick={handleSaveAndExport}
                    disabled={isExporting}
                    className="w-full py-2.5 bg-[#d8308f] hover:bg-[#e5459e] disabled:bg-[#d8308f]/50 disabled:text-white/50 text-white border border-[#f48fb1]/60 rounded-lg font-bold transition-colors cursor-pointer text-xs flex items-center justify-center gap-2 shadow-[0_0_10px_rgba(216,48,143,0.3)]"
                  >
                    {isExporting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Download className="w-4 h-4" />
                    )}
                    <span>
                      {isExporting ? "RENDERING..." : "SAVE & RENDER EXPORT"}
                    </span>
                  </button>

                  {isExporting && (
                    <div className="space-y-1.5 pt-2">
                      <div className="flex items-center justify-between text-[9px] font-bold text-[#e571b6]">
                        <span>{saveStatus}</span>
                        <span>{exportProgress}%</span>
                      </div>
                      <div className="w-full h-1 bg-[#0c0d10] rounded-full overflow-hidden border border-[#2f3342]">
                        <div
                          className="h-full bg-gradient-to-r from-[#d8308f] to-[#f48fb1] transition-all duration-200"
                          style={{ width: `${exportProgress}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
                {saveStatus && !isExporting && (
                  <div className="text-[10px] text-center font-bold text-[#f48fb1] animate-pulse">
                    {saveStatus}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="text-[9px] text-[#6e7382] border-t border-[#1f222e] pt-2 shrink-0 mt-3">
            LOCAL FILE SYSTEM 
          </div>
        </div>
      )}
    </div>
  );
};