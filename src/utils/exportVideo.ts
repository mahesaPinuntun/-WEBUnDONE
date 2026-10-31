import { useProjectStore } from '@/store/useProjectStore';

export interface ExportOptions {
  audioStream?: MediaStream;
  setIsExporting?: (val: boolean) => void;
  setExportProgress?: (val: number) => void;
}

export const exportProjectToVideo = async (
  canvasElement: HTMLCanvasElement,
  options?: ExportOptions
) => {
  const audioStream = options?.audioStream;
  const setIsExporting = options?.setIsExporting;
  const setExportProgress = options?.setExportProgress;

  const store = useProjectStore.getState();
  const { project, setIsPlaying, setCurrentTime } = store;
  
  if (!canvasElement) {
    alert("Canvas tidak ditemukan! Pastikan ID canvas sudah benar.");
    return;
  }

  if (setIsPlaying) setIsPlaying(false);
  if (setIsExporting) setIsExporting(true);
  if (setExportProgress) setExportProgress(0);
  setCurrentTime(0);

  // 1. Tangkap Stream Visual dari Canvas
  const canvasStream = canvasElement.captureStream(project.fps || 60);
  
  // 2. Gabungkan Visual dan Audio (jika audioStream tersedia)
  const combinedTracks = [...canvasStream.getVideoTracks()];
  if (audioStream) {
    combinedTracks.push(...audioStream.getAudioTracks());
  }
  
  // Buat MediaStream baru yang berisi gabungan Video + Audio
  const finalStream = new MediaStream(combinedTracks);
  
  // 3. Setup Video Encoder
  let mediaOptions = { mimeType: 'video/webm; codecs=vp9' }; 
  if (!MediaRecorder.isTypeSupported(mediaOptions.mimeType)) {
      mediaOptions.mimeType = 'video/webm; codecs=vp8';
  }
  if (MediaRecorder.isTypeSupported('video/mp4; codecs=avc1')) {
     mediaOptions.mimeType = 'video/mp4; codecs=avc1';
  }

  // Gunakan finalStream (Video + Audio) di sini
  const mediaRecorder = new MediaRecorder(finalStream, mediaOptions);
  const recordedChunks: Blob[] = [];

  mediaRecorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) {
      recordedChunks.push(event.data);
    }
  };

  mediaRecorder.onstop = () => {
    const isMp4 = mediaOptions.mimeType.includes('mp4');
    const extension = isMp4 ? 'mp4' : 'webm';
    
    const blob = new Blob(recordedChunks, { type: mediaOptions.mimeType });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    
    const safeProjectName = (project.name || 'Export').replace(/\s+/g, '_');
    a.download = `${safeProjectName}_${Date.now()}.${extension}`;
    
    document.body.appendChild(a);
    a.click();
    
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);

    if (setIsExporting) setIsExporting(false);
    if (setExportProgress) setExportProgress(100);
    
    setTimeout(() => {
      if (setExportProgress) setExportProgress(0);
    }, 2000);
  };

  mediaRecorder.start();

  const totalFrames = project.duration * (project.fps || 60);
  let currentFrame = 0;

  const renderFrame = () => {
    if (currentFrame > totalFrames) {
      mediaRecorder.stop();
      return;
    }

    const newTime = currentFrame / (project.fps || 60);
    setCurrentTime(newTime);
    if (setExportProgress) {
      setExportProgress(Math.round((currentFrame / totalFrames) * 100));
    }
    currentFrame++;
    
    requestAnimationFrame(renderFrame);
  };

  setTimeout(() => {
    renderFrame();
  }, 100);
};