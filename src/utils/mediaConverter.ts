import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

let ffmpegInstance: FFmpeg | null = null;

// Initialize FFmpeg WASM Instance
export async function getFFmpeg(onProgress?: (progress: number) => void): Promise<FFmpeg> {
  if (ffmpegInstance && ffmpegInstance.loaded) {
    return ffmpegInstance;
  }

  ffmpegInstance = new FFmpeg();

  if (onProgress) {
    ffmpegInstance.on('progress', ({ progress }) => {
      onProgress(Math.round(progress * 100));
    });
  }

  const baseURL = `${window.location.origin}/ffmpeg`;

  // Menggunakan URL string atau toBlobURL sesuai kecocokan lokal
  try {
    await ffmpegInstance.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
    });
  } catch (err) {
    console.warn('Gagal memuat FFmpeg via toBlobURL, mencoba URL string langsung:', err);
    await ffmpegInstance.load({
      coreURL: `${baseURL}/ffmpeg-core.js`,
      wasmURL: `${baseURL}/ffmpeg-core.wasm`,
    });
  }

  return ffmpegInstance;
}

/**
 * Converts video or GIF framerate to target project FPS on client side.
 * Menggunakan Fallback Safety agar impor file TIDAK PERNAH gagal.
 */
export async function convertMediaFPS(
  inputFile: File,
  targetFPS: number,
  onProgress?: (progress: number) => void
): Promise<File> {
  const isVideo = inputFile.type.startsWith('video');
  const isGif = inputFile.type.includes('gif') || inputFile.name.endsWith('.gif');

  // Skip conversion for standard images or audio
  if (!isVideo && !isGif) {
    return inputFile;
  }

  try {
    // Timeout Guard: Ditingkatkan menjadi 60 detik (12 detik terlalu singkat untuk WASM Video)
    const ffmpegPromise = getFFmpeg(onProgress);
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('FFmpeg processing timeout')), 60000)
    );

    const ffmpeg = await Promise.race([ffmpegPromise, timeoutPromise]);

    const inputName = `input_${Date.now()}_${inputFile.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
    const outputName = `converted_${Date.now()}.mp4`;

    // Write file to Virtual FS
    await ffmpeg.writeFile(inputName, await fetchFile(inputFile));

    // Run Conversion
    if (isGif) {
      await ffmpeg.exec([
        '-i', inputName,
        '-movflags', 'faststart',
        '-pix_fmt', 'yuv420p',
        '-r', targetFPS.toString(),
        outputName,
      ]);
    } else {
      await ffmpeg.exec([
        '-i', inputName,
        '-r', targetFPS.toString(),
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-crf', '22',
        '-c:a', 'aac',             // [FIX] Encode audio ke AAC (kompatibel penuh di browser)
        '-b:a', '128k',            // [FIX] Set bitrate standar web
        '-ac', '2',                // [FIX] Downmix audio ke stereo (mencegah error channel)
        '-movflags', 'faststart',  // [FIX] Letakkan MOOV atom di depan agar bisa dimuat cepat
        outputName,
      ]);
    }

    // Read Output
    const data = await ffmpeg.readFile(outputName);
    await ffmpeg.deleteFile(inputName).catch(() => {});
    await ffmpeg.deleteFile(outputName).catch(() => {});

    // Safe ArrayBuffer Parsing for Blob
    let bufferData: BlobPart;
    if (typeof data === 'string') {
      bufferData = new TextEncoder().encode(data);
    } else {
      const cleanArrayBuffer = new ArrayBuffer(data.byteLength);
      new Uint8Array(cleanArrayBuffer).set(data);
      bufferData = cleanArrayBuffer;
    }

    const convertedBlob = new Blob([bufferData], { type: 'video/mp4' });
    const rawFileName = inputFile.name.substring(0, inputFile.name.lastIndexOf('.')) || inputFile.name;
    const newFileName = `${rawFileName}_${targetFPS}fps.mp4`;

    return new File([convertedBlob], newFileName, { type: 'video/mp4' });
  } catch (err) {
    console.warn('Konversi FFmpeg gagal atau timeout. Menggunakan file asli sebagai fallback:', err);
    // CRITICAL FALLBACK: Kembalikan file asli agar impor di UI tetap berhasil 100%
    return inputFile;
  }
}