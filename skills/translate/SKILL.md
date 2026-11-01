---
name: translate
description: Translate text between Chinese and English while preserving Markdown formatting, code and terminology. Use when the user asks for a translation, or types /translate followed by the text.
license: Apache-2.0
compatibility: Works with any agent that supports explicit skill invocation. No network access required.
metadata:
  author: community
  version: "2.1"
---

# Translate

1. Detect the source language. If the user did not name a target language, translate Chinese into English and anything else into Chinese.
2. Preserve the Markdown structure exactly: headings, lists, tables and links. Never translate code blocks, inline code, URLs, file paths, or placeholders such as `{name}` and `%s`.
3. Keep product names and proper nouns unchanged unless there is a well-established translation.
4. Output only the translation. Add a short "Notes" section after it only when a term is ambiguous or a phrase has no direct equivalent.
5. For text longer than about 2,000 words, ask the user whether to translate it in parts.
