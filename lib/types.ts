export type HighlightColor = 'yellow' | 'mint' | 'lilac' | 'coral';
export type HighlightCoverage = 'small' | 'medium' | 'full';
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

export interface EncryptedSecret {
  version: 1;
  algorithm: 'AES-GCM';
  kdf: 'PBKDF2';
  hash: 'SHA-256';
  iterations: number;
  salt: string;
  iv: string;
  ciphertext: string;
}

export interface AnchorSettings {
  highlightColor: HighlightColor;
  highlightCoverage: HighlightCoverage;
  aiEnabled: boolean;
  aiProvider: AiProvider;
  aiEndpoint: string;
  aiModel: string;
  aiApiKey: string;
  aiApiKeyEncrypted?: EncryptedSecret;
}

export interface AnchorData {
  schemaVersion: 1;
  notes: AnchorNote[];
  settings: AnchorSettings;
}

export type ExtensionMessage =
  | { type: 'SAVE_NOTE'; note: Omit<AnchorNote, 'tags'> & { tags?: string[] } }
  | { type: 'UPDATE_NOTE'; note: AnchorNote }
  | { type: 'GET_NOTE'; id: string }
  | { type: 'DELETE_NOTE'; id: string }
  | { type: 'OPEN_LIBRARY' }
  | { type: 'CAPTURE_SELECTION' }
  | { type: 'SCROLL_TO_NOTE'; id: string };

export interface MessageResponse {
  ok: boolean;
  note?: AnchorNote;
  warning?: string;
  error?: string;
}
