<div align="center">

<img src="https://img.shields.io/badge/C--Insight-Visual%20Static%20Analyzer-0ea5e9?style=for-the-badge&logo=c&logoColor=white" alt="C-Insight"/>

# 🔬 C-Insight — The Visual Static Analyzer

**Parse · Analyze · Visualize · Fix — all in the browser.**

[![CI](https://github.com/tejusgupta00-bit/c-insight/actions/workflows/ci.yml/badge.svg)](https://github.com/tejusgupta00-bit/c-insight/actions/workflows/ci.yml)
[![Live Demo](https://img.shields.io/badge/Live%20Demo-Visit%20Now-22c55e?style=flat&logo=vercel&logoColor=white)](https://c-insight.vercel.app)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18-61dafb?style=flat&logo=react&logoColor=black)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-5.x-646cff?style=flat&logo=vite&logoColor=white)](https://vitejs.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.x-38bdf8?style=flat&logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-f59e0b?style=flat)](LICENSE)

<br/>

> A fully **client-side**, zero-backend web application that parses C source code, constructs a live **Abstract Syntax Tree (AST)**, runs **static analysis** for memory safety & complexity metrics, and renders everything as an interactive visual dashboard — all inside your browser.

<br/>

---

</div>

## ✨ Features at a Glance

| Feature | Description |
|---|---|
| 🌳 **Live AST Explorer** | Interactive collapsible node tree with color-coded cards and SVG flow lines |
| 🔍 **Static Analyzer** | Detects memory leaks, null-deref, use-after-free, buffer overflows & more |
| 📊 **Code Health Dashboard** | Live score (0–100), letter grade, cyclomatic complexity, SEI Maintainability Index |
| 🎨 **Syntax-Aware Editor** | Line gutter, per-line warning badges, bidirectional AST↔Editor highlighting |
| 📤 **Export** | AST as JSON, full analysis report as Markdown |
| 🌙 **Dark Mode** | Obsidian dark theme throughout, no light mode flash |
| ⚡ **Zero Backend** | Runs 100% in the browser — no server, no compiler needed |

---

## 🖥️ Preview

```
┌─────────────────────────────┬──────────────────────────────────┐
│  C Code Editor              │  Visual AST Tree                 │
│  ─────────────────          │  ─────────────────               │
│  Line gutter with           │  ┌─ FunctionDecl [blue]          │
│  ⚠ warning badges           │  │  ┌─ ForStatement [purple]     │
│                             │  │  │  └─ IfStatement [green]    │
│  int main() {               │  │     └─ CallExpr [slate]       │
│    int *p = malloc(...);    │  │                               │
│    for (int i = 0; ...) {   │  Code Health Dashboard           │
│      if (p[i] == 0) {       │  ──────────────────────          │
│    ...                      │  Score: 72/100  Grade: C         │
│                             │  ⚠ Memory Leak — CWE-401        │
│  [Presets ▾] [Export]       │  🔴 Null Deref — CWE-476        │
└─────────────────────────────┴──────────────────────────────────┘
```

---

## 🎨 AST Node Color Coding

| Color | Node Type | Example |
|---|---|---|
| 🔵 **Blue** | Function declarations | `int main()`, `void process()` |
| 🟣 **Purple** | Loop statements | `for`, `while`, `do-while` |
| 🟢 **Green** | Variables & declarations | `int x`, `char *buf` |
| 🟡 **Amber** | Warning-level issues | Memory leak, loop invariant |
| 🔴 **Red** | Critical issues | Null deref, use-after-free |
| ⬜ **Slate** | All other nodes | Expressions, binary ops |

---

## 🔬 Static Analysis — What It Detects

- **CWE-401** · Memory Leak — `malloc`/`calloc` without matching `free`
- **CWE-476** · NULL Pointer Dereference — unchecked `malloc` return
- **CWE-416** · Use-After-Free — pointer access after `free`
- **CWE-415** · Double Free — `free` called twice on same pointer
- **CWE-193** · Off-by-One — `<=` vs `<` in array loop guards
- **CWE-457** · Uninitialized Variable Read
- **CWE-242** · Insecure Functions — `gets`, unbounded `strcpy`, `sprintf`
- **PERF-001** · Loop Invariant — `strlen()` in loop termination condition
- **PERF-002** · Bitwise Optimization — `% 2` vs `& 1` parity check
- **Cyclomatic Complexity** — V(G) per function
- **SEI Maintainability Index** — composite quality score

---

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) v18 or higher
- npm v9+

### Run Locally

```bash
# 1. Clone the repository
git clone https://github.com/tejusgupta00-bit/c-insight.git
cd c-insight

# 2. Install dependencies
npm install

# 3. Start the development server
npm run dev

# 4. Open in your browser
#    http://localhost:5173/
```

### Build for Production

```bash
npm run build        # outputs to /dist
npm run preview      # preview the production build locally
```

---

## 🗂️ Project Structure

```
c-insight/
├── src/
│   ├── components/
│   │   ├── Header.tsx           # Top navigation bar
│   │   ├── EditorPanel.tsx      # C code editor with gutter
│   │   ├── VisualTree.tsx       # Recursive AST node tree
│   │   ├── ASTVisualizer.tsx    # Pan/zoom graph view
│   │   ├── CodeHealthDashboard.tsx  # Score + diagnostics
│   │   └── ExportModal.tsx      # JSON / Markdown export
│   ├── parser/
│   │   ├── lexer.ts             # Full C tokenizer
│   │   └── cParser.ts           # Recursive descent C→AST parser
│   ├── analyzer/
│   │   └── engine.ts            # Static analysis engine
│   ├── data/
│   │   └── presets.ts           # Built-in C code presets
│   ├── types/
│   │   ├── ast.ts               # ASTNode type definitions
│   │   └── analysis.ts          # Analysis result types
│   ├── App.tsx                  # Root layout & state
│   ├── main.tsx                 # React entry point
│   └── index.css                # Global styles & scrollbars
├── index.html
├── vite.config.ts
├── tailwind.config.js
├── tsconfig.json
└── package.json
```

---

## 🧪 Tech Stack

| Layer | Technology |
|---|---|
| UI Framework | React 18 + TypeScript |
| Build Tool | Vite 5 |
| Styling | Tailwind CSS 3 |
| Icons | Lucide React |
| Parser | Custom hand-rolled recursive descent (no ANTLR/tree-sitter) |
| Analyzer | Pure TypeScript — runs fully in-browser |
| CI | GitHub Actions |

---

## 🤝 Contributing

Contributions are welcome! Please:

1. Fork the repo
2. Create a feature branch: `git checkout -b feat/your-feature`
3. Commit your changes: `git commit -m 'feat: add your feature'`
4. Push to the branch: `git push origin feat/your-feature`
5. Open a Pull Request

---

## 📄 License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.

---

<div align="center">

Made with ❤️ by [tejusgupta00-bit](https://github.com/tejusgupta00-bit)

⭐ **Star this repo if you found it useful!**

</div>
