Place Aishwarya `.pt` model files in this folder for pipeline inspections.

Supported names (auto-discovered):
- `best_merged_original.pt` (default when **hull** or generic Aishwarya; not used for `inspection_source=pipeline` unless you set `NAUTICAI_AISHWARYA_MODEL_KEY`)
- `best_subpipe_full.pt`
- `best_subpipemini.pt`
- `best_subpipemini2.pt`
- `best_subsea1_4class.pt`
- `best_archive.pt`
- `best.pt`

For `inspection_source=pipeline`, the backend tries pipeline-related weights in order (preferred key → `subpipe_full` → `subpipemini` → …) before `merged_original`, so a missing `best_subpipe_full.pt` still loads `best_subpipemini.pt` if present.

You can override with env vars:
- `NAUTICAI_AISHWARYA_MODEL_DIR` (folder path)
- `NAUTICAI_AISHWARYA_MODEL_PATH` (exact `.pt` file path)
- `NAUTICAI_AISHWARYA_MODEL_KEY` (key name; if unset: hull defaults to `merged_original`, **pipeline** defaults to `subpipe_full`)
- `NAUTICAI_AISHWARYA_PIPELINE_MODEL_KEY` (optional; when pipeline and `MODEL_KEY` unset, default `subpipe_full`)
