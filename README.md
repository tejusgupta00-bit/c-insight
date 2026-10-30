# C-Insight: The Visual Static Analyzer

**C-Insight** is a modern, full-stack developer tool designed for visual C static analysis, interactive Abstract Syntax Tree (AST) exploration, and real-time code health & memory safety diagnostics.

---

## 🌟 Key Features

### 1. Two-Panel Responsive Studio
- **Left Panel (Interactive C Editor)**:
  - Real-time C syntax editor with customizable indentation and line numbers.
  - Gutter warning and danger badges marking memory risks directly on source lines.
  - Synchronized bidirectional highlighting: clicking or hovering an AST node or diagnostic issue scrolls and pulses the exact C code line(s).
  - Comes pre-loaded with a default C function featuring dynamic memory allocation, a `for loop`, and an `if condition`.
  - Additional presets: Memory Leak & Vulnerability Demo, Array Bounds & Off-by-One Risk, Safe Matrix (100% A+ score), and Uninitialized Pointer Dereference.
  - Code auto-formatter and one-click quick fix applicator.

- **Right Panel (Visual AST Tree Map & Code Health Dashboard)**:
  - **Visual AST Tree Map**:
    - Interactive hierarchical graph with Bézier connecting splines and color-coded node categories (`function`, `loop`, `condition`, `memory`, `declaration`, `expression`).
    - Smooth pan and zoom controls (Zoom In, Zoom Out, Mouse Wheel Zoom, Canvas Pan, Reset, Fit).
    - Expand & collapse branches with child counters.
    - Real-time search filter (e.g. `for`, `malloc`, `if`, `count`).
    - Depth control slider (Depth 2 to 8 / Deep).
    - Dual display modes: Visual Graph Map vs Hierarchical Tree Explorer.
    - Selected Node Inspector showing node type, line range, and parsed metadata.
  - **Code Health Dashboard**:
    - Live health score gauge (0-100) with dynamic letter grade (A+, A, B, C, D, F).
    - Memory Safety Score, Cyclomatic Complexity $V(G)$, Max Nesting Depth, Cognitive Complexity, and SEI Maintainability Index.
    - Comprehensive diagnostics covering:
      - Memory Leaks (`CWE-401` missing `free`)
      - NULL Pointer Dereferences (`CWE-476` unchecked `malloc`)
      - Use-After-Free (`CWE-416`)
      - Double Free (`CWE-415`)
      - Insecure Functions (`gets`, unbounded `strcpy`, `sprintf`)
      - Array Out-of-Bounds & Off-by-one errors in loop guards (`CWE-193`)
      - Uninitialized Variable Reads (`CWE-457`)
      - Loop Invariant recalculations (e.g. `strlen()` in loop termination condition)
      - Bitwise optimizations for parity checks (`% 2` vs `& 1`)
    - Dynamic Heap Allocation Lifecycle Table: tracks every `malloc`/`calloc` pointer, null guard status, and free invocation.
    - Function Complexity breakdown table.
    - One-click "Apply Fix" and "Copy Fix" buttons.

### 2. Export Capabilities
- Export full AST Tree to formatted JSON.
- Export full Static Analysis Report to Markdown or documentation.

---

## 🚀 Running Locally

```bash
# Navigate to project
cd c-insight

# Install dependencies
npm install

# Start Vite dev server (also serves the Compile & Run API)
npm run dev

# Open in browser:
http://localhost:5173/
```

### Desktop App (Electron)

C-Insight ships as a native desktop application powered by Electron. The compile-and-run service runs in the Electron main process (no separate dev server required).

```bash
# Development: Vite HMR + Electron window
npm run electron:dev

# Production build + native installer (macOS .dmg/.zip, Windows .exe, Linux .AppImage)
npm run electron:build

# Build the renderer and launch Electron against the built bundle
npm run electron:preview
```

### Compile & Run

C-Insight can now compile the buffer with **Apple Clang** (`-std=c99 -Wall -Wextra -O0`) and execute the resulting binary in an ephemeral, sandboxed temporary directory (macOS `sandbox-exec`, no network access, 2 s runtime limit, 64 KB output cap).

- Click the green **Run** button in the editor toolbar (or press `⌘/Ctrl + Enter`).
- Compiler diagnostics (errors / warnings) are parsed from Clang output and mapped onto the exact source lines in the gutter.
- Program `stdout` / `stderr`, exit code, and elapsed time stream into the collapsible **Console** panel beneath the editor.
- When the program blocks on `scanf`/`getchar`/`fgets`, type the input into the **interactive input line** that appears inline in the output and press Enter — no separate stdin panel needed.
- Output is forced unbuffered (`stdbuf -o0 -e0`), so `printf` prompts appear in real time even without `fflush`.
- A non-terminating program is killed at the runtime limit and reported as a timeout.

The compile service is exposed at `POST /api/compile-run` by the Vite dev server (`vite.config.ts` middleware) and is exercised by the test suite:

```bash
npm test
```

> Compile & Run currently requires **macOS with Apple Clang** (`/usr/bin/clang`) and `sandbox-exec`. On other platforms the endpoint returns a clear "unsupported platform" error.
