# CodeRecall icon assets

This directory contains 44 curated SVGs from the user's local **vscode-icons 13.0.0** extension, published by the vscode-icons team. Source: [vscode-icons](https://github.com/vscode-icons/vscode-icons). The original filenames and artwork are preserved. The MIT license and copyright notice are included in `LICENSE-vscode-icons.txt`. Product and language marks belong to their respective owners.

The application stores a stable `iconId` string on each file or folder, rather than storing duplicate SVG data. Assets are served by the deployed frontend from `/icons/`. A missing or unknown `iconId` uses the automatic icon inferred from the name and extension.

## Add more icons

1. Copy a desired SVG from the supplied extension's `icons/` directory into this directory. Review SVGs from other sources and retain their license and attribution.
2. Add an `icon(id, label, asset, keywords, associations)` entry in `frontend/src/lib/icons.js`. `asset` is the SVG filename without `.svg`; choose a new, permanent `id`.
3. Optionally set `extensions`, `filenames`, or `folderNames` to use the icon automatically. Add search terms to `keywords` to help find it in the picker.
4. Build the application. The new entry appears in the icon picker for both files and folders immediately after deployment.

Avoid changing an existing ID: saved library items may already reference it. Existing items can select **Automatic** to return to the default association. No SVG upload or storage bucket is required for this bundled catalog; the database stores each item's `iconId` alongside its other metadata.
