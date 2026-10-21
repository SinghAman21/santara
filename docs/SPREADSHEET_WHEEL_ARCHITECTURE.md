# Santara Spreadsheet Wheel Architecture

## Status and scope

Spreadsheet conversion is proposed but currently disabled with office conversion. LibreOffice probing alone does not enable an operation. Candidate formats are XLSX, ODS, CSV, and TSV; XLS is input-only and must be exposed only when a verified local reader is available. Do not advertise XLSX/ODS/CSV/TSV compatibility until each direction and its fidelity limits pass tests.

## Modifier and interaction model

- **Shift — Convert:** show only compatible verified output formats for the spreadsheet selection.
- **Alt — Tools:** no spreadsheet-specific editing tools are in initial scope. Show a compact options sheet only after choosing a supported export/conversion route.
- **Ctrl — File actions:** Copy, Move, Copy Path, Open Terminal, Share when available, and Quick Preview.

For CSV/TSV, ask only the necessary import/export details in an accessible options sheet: delimiter, character encoding, header-row interpretation, and worksheet selection for workbook exports. Provide safe defaults inferred from content but let the user confirm ambiguous delimiter/encoding choices. Do not make an editor dashboard mandatory.

## Candidate routes and options

The capability registry determines the actual valid route matrix. Candidate routes:

- XLSX ↔ ODS only where the specific reader/writer pair is verified.
- XLSX/ODS → CSV or TSV with an explicit worksheet selection; a single text file cannot preserve workbook sheets.
- CSV ↔ TSV with delimiter and encoding controls, preserving a header row only when the user opts in or it is reliably detected.
- XLS → XLSX/ODS/CSV/TSV only as a verified input route. XLS output is not offered.
- Spreadsheet → PDF only after safe office isolation and a tested PDF export route; choose worksheet and page scaling explicitly.

The app must warn when formulas may be recalculated, converted to cached values, or lost; macros, formatting, charts, conditional formatting, named ranges, comments, external links, multiple sheets, merged cells, and print layout may not survive. Never claim formula or workbook fidelity without property-specific tests. Never execute macros or fetch linked data.

## Compact output flow

Show selected input name, detected worksheets, chosen sheet(s), output format, and any data-loss warning before the job begins. For CSV/TSV, preview a bounded sample locally and identify parsing ambiguity without logging cell contents. Use `filename-converted.ext` beside the source, collision-safe naming, temporary output plus atomic publication, and local progress/result notifications with Open and Reveal in File Manager. Sources are never modified in place.

For multi-sheet exports, show expected file count and a predictable naming pattern such as `workbook-sheetname.csv`; sanitize sheet-derived names and resolve collisions. An explicit “all worksheets” choice may generate multiple outputs or a clearly labeled combined export only when the backend can define that behavior safely.

## Capability and safety requirements

Each route must specify input signatures, backend and per-filter support, worksheets, encoding/delimiter options, formula/value behavior, macro policy, output types, resource caps, metadata behavior, and test fixtures. File extensions do not prove that an input is a valid workbook. Treat workbooks as untrusted; isolate converters, disable macros and external links, bound memory/time/output, and clean temporary profiles. Keep conversion fully local and offline.

## Verification plan

- Test XLSX, ODS, CSV, TSV, and conditional XLS inputs independently with generated fixtures.
- Cover multiple sheets, formulas and cached values, dates, Unicode, quoted delimiters, embedded newlines, empty cells, headers, charts, formatting, and large-but-bounded data.
- Verify selected-sheet export, delimiter/encoding round trips, output parseability, row/column counts, and warnings for lost features.
- Test malformed and misleading-extension inputs, macro/external-link fixtures, missing backends, cancellation, collisions, permission failures, and no network access.
- Test keyboard-accessible route/options selection and file-manager reveal on Windows and Linux.

## Implementation sequence

1. Define isolated office execution, formula behavior, and independent reader/writer detection.
2. Implement CSV/TSV parsing/export with delimiter, encoding, header, and generated fixture coverage.
3. Add XLSX/ODS workbook routes and sheet selection after verifying each direction.
4. Add conditional XLS input support only after a tested safe reader exists.
5. Add PDF export only after office isolation and worksheet/page layout handling are validated.

