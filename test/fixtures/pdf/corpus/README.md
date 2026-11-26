# Anonymised PDF regression corpus

Add real device exports here only after removing patient identifiers. The test
runner reads `manifest.json` and fails if a listed PDF no longer parses.

## Before adding a file

1. Open the PDF and remove or cover the patient name, date of birth, patient ID,
   clinic, and any free-text notes.
2. Flatten the page so the removed text is no longer in the text layer.
3. Check the document properties (title, author, subject) and remove identifiers.
4. Rename the file to something neutral, for example `libreview-agp-2026-03.pdf`.
5. Keep the device, locale, report type and page count, because those are what
   the parser needs to survive.

Do not commit a file that still contains a name, an ID, a full date of birth or
a clinic name.

## Manifest entry

```json
{
  "file": "libreview-agp-2026-03.pdf",
  "pages": 14,
  "readings": 658,
  "unit": "mmol/L",
  "source": "LibreView PDF",
  "warningsInclude": "Daily Log graph"
}
```

`readings` is optional for summary PDFs; use `"summary": true` instead and the
runner checks that a summary was extracted without inventing readings.
