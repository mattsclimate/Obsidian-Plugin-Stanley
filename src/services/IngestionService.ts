export type IngestionStatus = 'extracted' | 'queued' | 'unsupported';
export type SourceType = 'markdown' | 'text' | 'pdf' | 'document' | 'image' | 'audio' | 'video' | 'unknown';

export interface SourceRecord {
  path: string;
  type: SourceType;
  status: IngestionStatus;
  cloudExtractionAvailable: boolean;
}

const LOCAL_TEXT_TYPES = new Set(['md', 'markdown', 'txt']);
const HEAVY_TYPES = new Set(['pdf', 'doc', 'docx', 'rtf', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'mp3', 'wav', 'm4a', 'mp4', 'mov']);

export class IngestionService {
  createRecord(path: string): SourceRecord {
    const extension = this.extension(path);
    const type = this.typeFor(extension);
    const locallyExtracted = LOCAL_TEXT_TYPES.has(extension);
    const queued = HEAVY_TYPES.has(extension);

    return {
      path,
      type,
      status: locallyExtracted ? 'extracted' : queued ? 'queued' : 'unsupported',
      cloudExtractionAvailable: queued || type === 'unknown',
    };
  }

  private extension(path: string): string {
    const leaf = path.split('/').pop() ?? path;
    const dot = leaf.lastIndexOf('.');
    return dot === -1 ? '' : leaf.slice(dot + 1).toLowerCase();
  }

  private typeFor(extension: string): SourceType {
    if (extension === 'md' || extension === 'markdown') return 'markdown';
    if (extension === 'txt') return 'text';
    if (extension === 'pdf') return 'pdf';
    if (['doc', 'docx', 'rtf'].includes(extension)) return 'document';
    if (['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(extension)) return 'image';
    if (['mp3', 'wav', 'm4a'].includes(extension)) return 'audio';
    if (['mp4', 'mov'].includes(extension)) return 'video';
    return 'unknown';
  }
}
