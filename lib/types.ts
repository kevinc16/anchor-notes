export type HighlightColor = 'yellow' | 'mint' | 'lilac' | 'coral';
export type AiProvider = 'local' | 'openrouter' | 'ollama' | 'custom';

export interface TextQuoteSelector {
  exact: string;
  prefix: string;
  suffix: string;
}

export interface HighlightAnchor {
  quote: TextQuoteSelector;
  startPath: string;
  startOffset: number;
  endPath: string;
  endOffset: number;
}

export interface AnchorNote {
  id: string;
  url: string;
  canonicalUrl?: string;
  title: string;
  quote: string;
  body: string;
  anchor: HighlightAnchor;
  pageSnapshot: {
    description: string;
    capturedAt: string;
  };
  color: HighlightColor;
  tags: string[];
  summary?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AnchorSettings {
  highlightColor: HighlightColor;
  aiProvider: AiProvider;
  aiEndpoint: string;
  aiModel: string;
  aiApiKey: string;
}

export interface AnchorData {
  schemaVersion: 1;
  notes: AnchorNote[];
  settings: AnchorSettings;
}

export type ExtensionMessage =
  | { type: 'SAVE_NOTE'; note: Omit<AnchorNote, 'tags'> & { tags?: string[] } }
  | { type: 'UPDATE_NOTE'; note: AnchorNote }
  | { type: 'DELETE_NOTE'; id: string }
  | { type: 'OPEN_LIBRARY' }
  | { type: 'CAPTURE_SELECTION' }
  | { type: 'SCROLL_TO_NOTE'; id: string };

export interface MessageResponse {
  ok: boolean;
  note?: AnchorNote;
  error?: string;
}
