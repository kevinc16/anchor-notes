export type ThemePreference = 'system' | 'light' | 'dark';
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

// Session-only metadata; never included in note exports or user-editable summaries.
export type SummaryGenerationStatus = { state: 'pending'; expiresAt: number } | { state: 'unavailable' };

export type TagOperation = 'add' | 'remove' | 'replace';
export type GenerationOutcome = 'completed' | 'failed' | 'skipped';
export interface BulkGeneration {
  id: string;
  expiresAt: number;
  // Error details are attached to runtime responses only, never persisted.
  items: Array<{ id: string; state: 'queued' | 'pending' | GenerationOutcome; error?: string }>;
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
  theme: ThemePreference;
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

export interface NoteReturnIntent {
  id: string;
  expiresAt: number;
}

export type ExtensionMessage =
  | { type: 'SETTINGS_RESTORED' }
  | { type: 'SAVE_NOTE'; note: Omit<AnchorNote, 'tags'> & { tags?: string[] } }
  | { type: 'UPDATE_NOTE'; note: AnchorNote }
  | { type: 'BULK_EDIT_TAGS'; ids: string[]; operation: TagOperation; tags: string }
  | { type: 'START_BULK_GENERATION'; ids: string[]; prompt?: string }
  | { type: 'GET_BULK_GENERATION' }
  | { type: 'GET_NOTE'; id: string }
  | { type: 'DELETE_NOTE'; id: string }
  | { type: 'OPEN_LIBRARY' }
  | { type: 'RETURN_TO_SOURCE'; id: string; active: boolean }
  | { type: 'TAKE_NOTE_RETURN' }
  | { type: 'CAPTURE_SELECTION' }
  | { type: 'SCROLL_TO_NOTE'; id: string };

export interface MessageResponse {
  ok: boolean;
  returnIntent?: NoteReturnIntent;
  note?: AnchorNote;
  warning?: string;
  error?: string;
  tagResult?: { changed: number; skipped: number };
  batch?: BulkGeneration;
}
