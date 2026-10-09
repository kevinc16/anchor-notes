# Anchor Notes Privacy Policy

Last updated: October 9, 2026

Anchor Notes is a local-first browser extension. This policy explains what the extension stores, when it sends information outside the browser, and how you can control that behavior.

## Information stored locally

Anchor Notes stores highlights, notes, page titles, page URLs, settings, and locally generated tags in the browser's extension storage. These data stay in the browser profile unless you export them or enable an optional remote organizer. Anchor Notes does not operate an account system, analytics service, advertising system, or Anchor Notes backend.

Provider credentials are also stored in browser extension storage when you choose to save them. Optional passphrase encryption is available in Settings. Anchor Notes does not send provider credentials to an Anchor Notes server.

## Local organization

Local topic organization is enabled by default and runs inside the extension. It does not make network requests or transmit note content.

## Optional remote organizers

Remote organization is disabled by default. If you enable an OpenRouter or custom OpenAI-compatible provider, Anchor Notes sends the newly saved note's page title, page URL, selected quote, and note text to the endpoint you configure so that provider can generate tags and a summary. The configured provider may also receive the request metadata and API credential required by that provider.

Ollama requests can remain on the device when Ollama is running at its local endpoint. A custom endpoint may be local or remote depending on the address you configure.

Anchor Notes does not control how a third-party provider stores or processes information after it receives a request. Review the provider's privacy policy and retention terms before enabling a remote organizer. You can disable the remote organizer in Settings at any time.

## Data deletion and export

You can edit or delete notes in Anchor Notes and export or clear extension data through the extension's settings and browser storage controls. Disabling or deleting the extension removes Anchor Notes' local access to the stored data, but it does not delete information already sent to a third-party provider. Contact that provider directly about provider-side retention or deletion.

## Contact

For questions or privacy concerns, use the [Anchor Notes issue tracker](https://github.com/kevinc16/anchor-notes/issues). Please do not include private note content, page URLs, API keys, or other sensitive information in an issue.

