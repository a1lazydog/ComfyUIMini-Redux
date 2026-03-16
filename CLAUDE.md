# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development
npm start              # Run server (production-like)
npm run dev            # Run server + client watch concurrently
npm run dev:server     # Server watch only
npm run dev:client     # Client watch only

# Build
npm run build          # Compile client TypeScript
npm run build:client   # Same as build

# Test
npm test               # Full test suite
npm run test:watch     # Watch mode
npm run test:changed   # Only changed files
npm run test:fast      # 2 workers, no cache

# Run a specific test file
npx jest src/__tests__/image.test.ts

# Run tests matching a name pattern
npx jest --testNamePattern="formatDate"

# Lint / Format
npm run lint           # ESLint
npm run lint:fix       # Auto-fix ESLint issues
npm run format         # Prettier
```

## Architecture

ComfyUIMini is a **mobile-friendly PWA** that wraps ComfyUI with a lightweight UI layer. It runs as an Express server that proxies ComfyUI's API and serves a browser frontend.

### Code Split

The repo has three TypeScript compilation scopes, each with its own `tsconfig.json`:

| Scope | Entry | Target | Notes |
|-------|-------|--------|-------|
| `src/server/` | `index.ts` | ESNext/CommonJS | Node.js Express server |
| `src/client/` | per-page files | ES2022 modules | Browser, compiled to `dist/` |
| `src/__tests__/` | test files | ES2022 | Jest + ts-jest + JSDOM |

All three scopes import from `src/shared/` via the `@shared/*` path alias.

### Shared Layer (`src/shared/`)

- **`classes/Workflow.ts`** — `WorkflowInstance`: core domain class. Handles validation, metadata parsing, input filling, and distinguishes new format (separate `.meta` files) from legacy format.
- **`types/`** — Canonical types: `Workflow`, `InputOption`, WebSocket message shapes, `SavedInputs`, `ComfyObjectInfo`, `History`.

### Server (`src/server/`)

- **`index.ts`** — HTTP + WebSocket server setup.
- **`routes/`** — `mainRouter` (workflows, gallery, queue), `comfyUIRouter` (proxy to ComfyUI), `settingsRouter`, `wsRouter`, `renderRouter`.
- **`utils/comfyAPIUtils/`** — All ComfyUI API integration:
  - `generateImage/` — Queues prompts, handles WebSocket messages for progress/completion/preview.
  - `getHistory/`, `getQueue/`, `getRawObjectInfo/`, `uploadImage/`, `uploadMask/`.
- **`utils/workflowUtils.ts`** — Server-side workflow CRUD; metadata is stored in separate `.meta` files alongside the workflow JSON.
- **`utils/galleryUtils.ts`** — Navigates `output/` and `input/` galleries with subfolder + pagination support.
- **`views/`** — EJS templates rendered server-side.

### Client (`src/client/public/js/`)

- **`pages/`** — One file per page (index, workflow, edit, import, gallery, queue, settings). Each file is the controller for that page.
- **`modules/`** — Feature modules: `workflowInputRenderer.ts` / `inputRenderers.ts` dynamically build HTML forms from workflow metadata; `progressBar.ts` shows live generation progress; `imageInputRenderer.ts` / `resolutionSelector.ts` handle image-type inputs.
- **`common/`** — Utilities: `websocket.ts` (WebSocket client), `imageModal.ts`, `maskCreationModal.ts`, `galleryNavigation.ts`, `pullToRefresh.ts`, `actionSheet.ts`, `formatString.ts` (date placeholder expansion), `savedInputValues.ts` (localStorage persistence).

### Key Patterns

**Metadata-driven forms**: Workflow inputs rendered dynamically from `InputOption` metadata (type, label, disabled, hidden, slider/dropdown config). Editing metadata is separate from editing the workflow JSON.

**Dual storage**: Workflows stored either in browser localStorage or as server-side files. Server format uses `<name>.json` + `<name>.meta` file pairs.

**Real-time via WebSocket**: Client connects to server WebSocket, which bridges to ComfyUI's WebSocket. Message types: `Progress`, `NodeExecuting`, `NodeExecuted`, `ExecutionSuccess`, `Preview` (defined in `src/shared/types/WebSocket.ts`).

**Configuration**: Uses the `config` npm package. Config file auto-created on first run. Runtime changes via settings page hit `settingsRouter`.
