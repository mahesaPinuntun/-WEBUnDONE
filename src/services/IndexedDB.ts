import Dexie, { Table } from 'dexie';
import { Project } from '@/types/editor';

export interface StoredMediaAsset {
  id: string;
  projectId: string;
  name: string;
  type: string; // e.g. 'video/mp4', 'audio/mp3'
  size: number;
  blob: Blob;
  createdAt: number;
}

export class EsanoDatabase extends Dexie {
  projects!: Table<Project, string>;
  mediaAssets!: Table<StoredMediaAsset, string>;

  constructor() {
    super('EsanoForVidzDB');
    this.version(1).stores({
      projects: 'id, name, updated',
      mediaAssets: 'id, projectId, name, type',
    });
  }
}

export const db = new EsanoDatabase();

// Helper functions for storage management
export async function saveProjectToDB(project: Project): Promise<void> {
  await db.projects.put(project);
}

export async function loadProjectFromDB(id: string): Promise<Project | undefined> {
  return await db.projects.get(id);
}

export async function saveMediaAssetToDB(asset: StoredMediaAsset): Promise<void> {
  await db.mediaAssets.put(asset);
}

export async function getMediaAssetFromDB(id: string): Promise<StoredMediaAsset | undefined> {
  return await db.mediaAssets.get(id);
}