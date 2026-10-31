import { convertMediaFPS } from '@/utils/mediaConverter';

declare global {
  interface Window {
    showDirectoryPicker?: (options?: {
      mode?: 'read' | 'readwrite';
    }) => Promise<FileSystemDirectoryHandle>;
  }

  interface FileSystemHandle {
    queryPermission?: (descriptor?: {
      mode?: 'read' | 'readwrite';
    }) => Promise<PermissionState>;
    requestPermission?: (descriptor?: {
      mode?: 'read' | 'readwrite';
    }) => Promise<PermissionState>;
  }
}

const DB_NAME = 'ForVidz_FileSystem_DB';
const STORE_NAME = 'handles';
const HANDLE_KEY = 'project_workspace_dir';

export async function getIDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveDirectoryHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  const db = await getIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(handle, HANDLE_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getStoredDirectoryHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await getIDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const request = tx.objectStore(STORE_NAME).get(HANDLE_KEY);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  } catch {
    return null;
  }
}

export async function verifyPermission(
  fileHandle: FileSystemDirectoryHandle,
  readWrite = true
): Promise<boolean> {
  const options = {
    mode: readWrite ? ('readwrite' as const) : ('read' as const),
  };

  if (fileHandle.queryPermission) {
    if ((await fileHandle.queryPermission(options)) === 'granted') {
      return true;
    }
  }

  if (fileHandle.requestPermission) {
    if ((await fileHandle.requestPermission(options)) === 'granted') {
      return true;
    }
  }

  return false;
}

// Helper untuk menghasilkan nama file unik jika sudah ada nama yang sama di folder
async function getUniqueFileName(
  folderHandle: FileSystemDirectoryHandle,
  originalName: string
): Promise<string> {
  const nameParts = originalName.split('.');
  const ext = nameParts.length > 1 ? nameParts.pop() : '';
  const baseName = nameParts.join('.').replace(/[^a-zA-Z0-9._-]/g, '_');

  let candidateName = ext ? `${baseName}.${ext}` : baseName;
  let counter = 1;

  while (true) {
    try {
      await folderHandle.getFileHandle(candidateName, { create: false });
      // File sudah ada, tambahkan suffix angka
      candidateName = ext ? `${baseName}_${counter}.${ext}` : `${baseName}_${counter}`;
      counter++;
    } catch {
      // File belum ada, aman digunakan
      break;
    }
  }

  return candidateName;
}

export async function saveFileToWorkspace(
  dirHandle: FileSystemDirectoryHandle,
  file: File,
  subDir = 'imported_media'
): Promise<FileSystemFileHandle> {
  const mediaFolder = await dirHandle.getDirectoryHandle(subDir, { create: true });
  const uniqueName = await getUniqueFileName(mediaFolder, file.name);
  const fileHandle = await mediaFolder.getFileHandle(uniqueName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(file);
  await writable.close();
  return fileHandle;
}

// Sesuaikan fungsi ini di dalam src/utils/fileSystem.ts

export async function createProjectFolderPackage(
  rootHandle: FileSystemDirectoryHandle,
  folderName: string, // <-- Terima nama folder secara langsung
  projectConfig: Record<string, any>
): Promise<{ projectDirHandle: FileSystemDirectoryHandle; projectPath: string }> {
  
  // Hapus variabel Date.now() di sini agar tidak dobel dengan store
  // Gunakan folderName yang sudah di-generate oleh useProjectStore
  const projectDirHandle = await rootHandle.getDirectoryHandle(folderName, { create: true });

  await projectDirHandle.getDirectoryHandle('media', { create: true });
  await projectDirHandle.getDirectoryHandle('exports', { create: true });

  const fileHandle = await projectDirHandle.getFileHandle('project.json', { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(JSON.stringify(projectConfig, null, 2));
  await writable.close();

  return {
    projectDirHandle,
    projectPath: `${rootHandle.name}/${folderName}`,
  };
}

// Menyimpan File Media ke Subfolder '/media/' pada Package Project Lokal
export async function saveMediaToProjectPackage(
  projectDirHandle: FileSystemDirectoryHandle,
  file: File,
  targetFPS = 60,
  onProgress?: (progress: number, statusText: string) => void
): Promise<{ fileUrl: string; fileName: string; convertedFile: File }> {
  const hasPermission = await verifyPermission(projectDirHandle, true);
  if (!hasPermission) {
    throw new Error('Izin penulisan ke folder proyek ditolak.');
  }

  if (onProgress) onProgress(10, 'Mengonversi Framerate Media...');

  // Convert video/GIF framerate client-side
  const processedFile = await convertMediaFPS(file, targetFPS, (p) => {
    if (onProgress) onProgress(10 + Math.round(p * 0.6), 'Mengompresi & Mencocokkan FPS...');
  });

  if (onProgress) onProgress(75, 'Memeriksa duplikasi nama file...');
  const mediaFolderHandle = await projectDirHandle.getDirectoryHandle('media', { create: true });

  // Generate nama file unik dengan penomoran
  const uniqueFileName = await getUniqueFileName(mediaFolderHandle, processedFile.name);

  if (onProgress) onProgress(85, 'Menulis file ke subfolder /media/ disk...');
  const fileHandle = await mediaFolderHandle.getFileHandle(uniqueFileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(processedFile);
  await writable.close();

  if (onProgress) onProgress(100, 'Selesai menyimpan media.');

  const savedFile = await fileHandle.getFile();
  const fileUrl = URL.createObjectURL(savedFile);

  return {
    fileUrl,
    fileName: uniqueFileName,
    convertedFile: processedFile,
  };
}