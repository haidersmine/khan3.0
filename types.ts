
export enum BindingType {
  LONG_EDGE = 'LONG_EDGE',
  SHORT_EDGE = 'SHORT_EDGE'
}

export enum AppMode {
  ORGANIZER = 'ORGANIZER',
  IMPOSITION = 'IMPOSITION',
  EXPORT = 'EXPORT'
}

export interface ImpositionConfig {
  paperSize: 'A4';
  outputSize: 'A5';
  binding: BindingType;
  rotateBack: boolean;
}

export type PageSourceType = 'original' | 'blank' | 'external' | 'duplicate';

export interface PageItem {
  id: string;
  type: PageSourceType;
  sourceFileId?: string;
  originalPageIndex?: number;
  label: string;
}

export interface PageMap {
  sheetIndex: number;
  front: {
    left: PageItem | null;
    right: PageItem | null;
  };
  back: {
    left: PageItem | null;
    right: PageItem | null;
  };
}

export interface ProcessingState {
  isProcessing: boolean;
  progress: number;
  error: string | null;
  resultUrl: string | null;
}
