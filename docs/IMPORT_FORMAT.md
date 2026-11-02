# Import files and AI edits

Choose **New → Import JSON…** in Find code or Explorer. Drop one JSON file into the dialog or choose it from your device. Imports are placed inside the folder you were browsing. Review the file list and counts, then choose **Import**. Use **Undo** to restore the complete library, including its tags, until you make another change.

Download the example from the import dialog, or use [coderecall-import.json](../frontend/public/examples/coderecall-import.json). No account is required. The JSON stays on your device.

## A format to give an AI

Ask an AI for a JSON file in this format. Use `children` to put files inside folders, and `content` for exact code. Each `description` is the item's notes, which remain editable in the app. Tags are names, so no IDs or timestamps need to be generated.

```json
{
  "format": "coderecall-import",
  "version": 1,
  "items": [
    {
      "type": "folder",
      "name": "Examples",
      "description": "Reusable Java examples",
      "tags": ["Java"],
      "children": [
        {
          "type": "file",
          "name": "Hello.java",
          "content": "public class Hello {\n    public static void main(String[] args) {\n        System.out.println(\"Hello!\");\n    }\n}\n",
          "description": "Prints a greeting to the console.",
          "tags": ["java", "Basics"]
        }
      ]
    }
  ]
}
```

Suggested prompt:

> Return a downloadable CodeRecall import JSON file using `format: "coderecall-import"`, `version: 1`, and an `items` array. Each item has `type` (`folder` or `file`), `name`, and optional `description` and `tags` (an array of tag names). Folders contain a `children` array; files contain the complete code in `content`. Descriptions hold explanations and notes. Preserve folder paths and filenames when editing existing files. Include only items that should be added or updated. Omit descriptions and tags that should stay unchanged. Escape code as valid JSON strings, without markdown fences inside the JSON file.

## How an import merges

- Matching paths are compared without regard to capitalization. A matching folder receives its imported children; a matching file receives the complete supplied `content`. Existing IDs, creation dates, stars, and custom icons are retained.
- Existing files and folders absent from the JSON stay in the library. Importing never deletes unrelated items.
- Each preview row shows whether it will be added, updated, or left unchanged. If a file and folder share the same path, the import stops with an error so you can resolve the name.
- Tags reuse the existing catalog regardless of capitalization, surrounding whitespace, or repeated spaces. For example, `Python`, `python`, and `PYTHON` resolve to one tag; the existing tag keeps its spelling. Only new names create tags.
- A supplied `tags` array replaces the item's assigned tags. `"tags": []` clears them; omitting `tags` preserves existing assignments. Folder tags still provide inherited search context to their children.
- Omitting `description` preserves existing notes. `"description": ""` clears them. A plain description replaces previous formatting. `notes` is also accepted as a string alias for `description`; supply only one of those fields.
- File `content` is required, including `"content": ""` for an intentionally empty file. It replaces the whole file; partial code patches are not applied.
- Filenames include their extensions, such as `main.java` or `notes.md`. Names cannot contain path separators, control characters, `.` or `..`. Represent paths by nesting folders.

## Formatted notes

To preserve font size, bold, italic, or underline, include `descriptionFormat` alongside the exact plain `description`. The run text must concatenate to the description, including newlines. This is the same safe text format used by saved CodeRecall files; HTML is not accepted.

```json
{
  "type": "file",
  "name": "example.py",
  "content": "print('Hello')\n",
  "description": "Greeting\nPrints a message.",
  "descriptionFormat": {
    "version": 1,
    "runs": [
      { "text": "Greeting", "bold": true, "fontSize": 20 },
      { "text": "\nPrints a message." }
    ]
  },
  "tags": ["Python"]
}
```

Run marks are optional `bold`, `italic`, and `underline` booleans, plus `fontSize` from 12, 14, 16, 18, 20, 24, 28, or 32. The default size is 16. Descriptions are limited to 4,000 characters and tag names to 40 Unicode characters.

## Existing backups and limits

The import dialog also accepts the native version 2 JSON exported from **Account & backup**. It maps the backup's tag IDs back to names, then merges the hierarchy using the same rules. To share your current code with an AI, export a backup and ask it to return only the paths it changes in the portable format above. **Account & backup → Import** continues to restore a full backup by replacement; use **New → Import JSON…** for merging.

An import file can be up to 4 MiB, contain up to 5,000 items, and nest up to 64 levels. Invalid JSON, malformed notes, duplicate sibling names, and unsupported fields stop the import before anything is saved. Storage errors leave the current library in place and keep the dialog open.
