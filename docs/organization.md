# Organization guide

[Back to README](../README.md)

## Local tag generation

Every new note is tagged locally before any optional LLM organization runs:

1. Anchor Notes lowercases the page title, highlighted quote, and note body.
2. It checks that text against fixed keyword lists for `design`, `engineering`, `research`, `product`, `ideas`, and `learning`.
3. Each matching keyword contributes one point. The three highest-scoring topics are retained.
4. A short label derived from the source hostname is appended.
5. Duplicate tags are removed and the result is limited to four tags.

This path is deterministic and makes no network requests. It uses substring matching and a small English vocabulary, so its suggestions can be broad or incomplete. Tags can be corrected in the library or directly from the saved-highlight editor on the webpage.

## Bulk organization

In the library, choose **Select notes** to show card checkboxes. Select individual notes or **Select all matching notes**, which includes matching notes in collapsed website groups. Search or topic changes clear selection; sorting and grouping preserve it. Deleted notes are removed from selection.

Use **Add tags**, **Remove tags**, or **Replace tags** to edit the selected notes without sending any data to a provider. Tags are trimmed, lowercased, and de-duplicated. Replacing with an empty field clears all tags on the selected notes; the action button shows the affected count.

**Regenerate tags and summaries** explicitly sends the selected notes to the enabled LLM provider and replaces their tags and summaries on success. Requests run two at a time, with per-note progress and completed/failed/skipped counts. Failed or unusable responses retain existing values. Notes edited or deleted during generation are skipped. **Retry failed notes** processes only failed items from the last batch. Closing the library does not cancel a running batch; interrupted background work is reported as failed and can be retried. Batch status is session-only and excluded from backups.

Failed batches show a prominent alert. When available, it includes the provider's error message and HTTP status; unreadable responses and invalid model JSON get a clear fallback. Provider messages are shortened, displayed as text, and have the configured API key redacted. Error details remain only in background memory, outside browser storage and backups. Reopening the library can show them while that background instance is alive; after a restart, the generic failure alert remains and requests can be retried.

Enable a provider and unlock any encrypted key in Settings before regenerating. Firefox also requires the existing remote-data consent. Optional custom generation prompts are tracked separately in [issue #82](https://github.com/kevinc16/anchor-notes/issues/82).

## Optional LLM setup

Open **Anchor Notes → Settings**, enable AI organization, and choose a provider:

- **OpenRouter:** uses `https://openrouter.ai/api/v1/chat/completions` and defaults to the `openrouter/free` router. Add an OpenRouter API key and optionally choose a specific open or free model slug.
- **Ollama:** connects locally through `http://localhost:11434/v1/chat/completions`. Pull the model in Ollama first, then enter the same model name in Anchor Notes. Local Ollama does not require an API key.
- **Custom:** accepts any OpenAI-compatible chat-completions endpoint, model, and optional bearer token.

New notes are sent automatically only when AI organization is enabled and a provider other than local rules is selected. Firefox also requires consent for remote providers. Existing notes are sent only when you explicitly choose **Regenerate tags and summaries** in the library. Local topic rules remain the default.

The library shows **Generating summary…** on each note while its LLM request is running and updates automatically when it finishes. Failed, empty, or interrupted requests show **Summary unavailable. Your note is saved.**; pending indicators expire after one minute. Notes and local tags remain saved, and late results cannot replace manual edits or restore deleted notes. Generation status lasts only for the browser session and is excluded from JSON backups.

Remote-provider API keys use browser extension local storage by default. That storage is local to the browser profile, but browsers do not encrypt it for the extension. The Settings page labels this clearly and offers optional passphrase encryption; encryption is never enabled or applied automatically.

When encryption is selected, Anchor Notes derives a key from a passphrase with PBKDF2-SHA-256 (250,000 iterations) and stores only AES-GCM ciphertext plus the salt, IV, and algorithm metadata. The passphrase is never stored. After unlocking, the decrypted API key lives only in non-persistent extension session storage and must be unlocked again after the browser restarts. Losing the passphrase requires replacing the API key. This protects the credential at rest, but not against a compromised browser profile or malicious extension code running while the key is unlocked.

If a new highlight is saved while an encrypted API key is locked, Anchor Notes saves the highlight and local tags but tells you that the key was not used. Unlock the key with its passphrase in Settings before relying on AI organization.

Review the [privacy policy](../PRIVACY.md) and your provider’s retention terms before enabling remote organization.
