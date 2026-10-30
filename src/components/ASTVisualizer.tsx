import React, { useState, useRef, useMemo, useEffect } from 'react';
import { ASTNode, ASTCategory } from '../types/ast';
import {
  ZoomIn, ZoomOut, Maximize2, RotateCcw, Search,
  ChevronRight, ChevronDown, Layers, Info, Filter,
  ExternalLink, Sparkles, Code2, Cpu
} from 'lucide-react';

interface ASTVisualizerProps {
  ast: ASTNode;
  selectedLine: number | null;
  onSelectNode: (node: ASTNode | null) => void;
  activeNode: ASTNode | null;
}

const CATEGORY_STYLES: Record<ASTCategory, { border: string; bg: string; text: string; glow: string; badge: string }> = {
  root: {
    border: 'border-slate-500',
    bg: 'bg-slate-900/90',
    text: 'text-slate-200',
    glow: 'rgba(148, 163, 184, 0.25)',
    badge: 'bg-slate-800 text-slate-300'
  },
  directive: {
    border: 'border-fuchsia-500/70',
    bg: 'bg-fuchsia-950/40',
    text: 'text-fuchsia-300',
    glow: 'rgba(217, 70, 239, 0.3)',
    badge: 'bg-fuchsia-900/60 text-fuchsia-200'
  },
  function: {
    border: 'border-purple-500/70',
    bg: 'bg-purple-950/40',
    text: 'text-purple-300',
    glow: 'rgba(168, 85, 247, 0.3)',
    badge: 'bg-purple-900/60 text-purple-200'
  },
  loop: {
    border: 'border-amber-500/80',
    bg: 'bg-amber-950/40',
    text: 'text-amber-300',
    glow: 'rgba(245, 158, 11, 0.35)',
    badge: 'bg-amber-900/60 text-amber-200'
  },
  condition: {
    border: 'border-cyan-500/80',
    bg: 'bg-cyan-950/40',
    text: 'text-cyan-300',
    glow: 'rgba(6, 182, 212, 0.35)',
    badge: 'bg-cyan-900/60 text-cyan-200'
  },
  memory: {
    border: 'border-emerald-500/80',
    bg: 'bg-emerald-950/40',
    text: 'text-emerald-300',
    glow: 'rgba(16, 185, 129, 0.35)',
    badge: 'bg-emerald-900/60 text-emerald-200'
  },
  declaration: {
    border: 'border-blue-500/70',
    bg: 'bg-blue-950/40',
    text: 'text-blue-300',
    glow: 'rgba(59, 130, 246, 0.3)',
    badge: 'bg-blue-900/60 text-blue-200'
  },
  expression: {
    border: 'border-indigo-500/70',
    bg: 'bg-indigo-950/40',
    text: 'text-indigo-300',
    glow: 'rgba(99, 102, 241, 0.3)',
    badge: 'bg-indigo-900/60 text-indigo-200'
  },
  statement: {
    border: 'border-slate-600',
    bg: 'bg-slate-900/80',
    text: 'text-slate-300',
    glow: 'rgba(100, 116, 139, 0.2)',
    badge: 'bg-slate-800 text-slate-300'
  },
  literal: {
    border: 'border-teal-500/60',
    bg: 'bg-teal-950/30',
    text: 'text-teal-300',
    glow: 'rgba(20, 184, 166, 0.25)',
    badge: 'bg-teal-900/60 text-teal-200'
  }
};

interface FlatLayoutNode {
  node: ASTNode;
  depth: number;
  x: number;
  y: number;
  width: number;
  height: number;
  parent: FlatLayoutNode | null;
  collapsed: boolean;
}

export const ASTVisualizer: React.FC<ASTVisualizerProps> = ({
  ast,
  selectedLine,
  onSelectNode,
  activeNode
}) => {
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 40, y: 40 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [maxDepth, setMaxDepth] = useState<number>(6);
  const [viewMode, setViewMode] = useState<'graph' | 'tree'>('graph');
  const [collapsedNodeIds, setCollapsedNodeIds] = useState<Set<string>>(new Set());

  const containerRef = useRef<HTMLDivElement>(null);

  // Toggle collapse for a node
  const toggleCollapse = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setCollapsedNodeIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const collapseAll = () => {
    const allIds = new Set<string>();
    function collect(n: ASTNode) {
      if (n.children.length > 0 && n.id !== 'root') allIds.add(n.id);
      n.children.forEach(collect);
    }
    collect(ast);
    setCollapsedNodeIds(allIds);
  };

  const expandAll = () => {
    setCollapsedNodeIds(new Set());
  };

  const resetView = () => {
    setZoom(1);
    setPan({ x: 40, y: 40 });
  };

  // Zoom handlers
  const handleZoom = (delta: number) => {
    setZoom(prev => Math.min(2.5, Math.max(0.3, prev + delta)));
  };

  // Mouse wheel zoom
  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const zoomDelta = -e.deltaY * 0.002;
      setZoom(prev => Math.min(2.5, Math.max(0.3, prev + zoomDelta)));
    } else {
      // Pan
      setPan(prev => ({
        x: prev.x - e.deltaX * 0.8,
        y: prev.y - e.deltaY * 0.8
      }));
    }
  };

  // Drag pan handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      setPan({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Layout calculation for Graph View
  const layout = useMemo(() => {
    const nodes: FlatLayoutNode[] = [];
    const NODE_WIDTH = 240;
    const NODE_HEIGHT = 86;
    const HORIZONTAL_GAP = 90;
    const VERTICAL_GAP = 28;

    let currentYByDepth: Record<number, number> = {};

    function traverse(
      node: ASTNode,
      depth: number,
      parent: FlatLayoutNode | null
    ): FlatLayoutNode | null {
      if (depth > maxDepth) return null;

      const isCollapsed = collapsedNodeIds.has(node.id);
      const startY = currentYByDepth[depth] || 40;

      const flatNode: FlatLayoutNode = {
        node,
        depth,
        x: depth * (NODE_WIDTH + HORIZONTAL_GAP) + 30,
        y: startY,
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
        parent,
        collapsed: isCollapsed
      };

      nodes.push(flatNode);

      if (!isCollapsed && node.children.length > 0) {
        let childYSum = 0;
        let visibleChildCount = 0;

        for (const child of node.children) {
          const childLayout = traverse(child, depth + 1, flatNode);
          if (childLayout) {
            childYSum += childLayout.y;
            visibleChildCount++;
          }
        }

        // Center parent vertically with respect to children
        if (visibleChildCount > 0) {
          const avgY = childYSum / visibleChildCount;
          if (avgY > flatNode.y) {
            flatNode.y = avgY;
          }
        }
      }

      currentYByDepth[depth] = flatNode.y + NODE_HEIGHT + VERTICAL_GAP;
      return flatNode;
    }

    traverse(ast, 0, null);

    // Compute bounding canvas size
    let maxX = 800;
    let maxY = 600;
    nodes.forEach(n => {
      if (n.x + n.width > maxX) maxX = n.x + n.width + 100;
      if (n.y + n.height > maxY) maxY = n.y + n.height + 100;
    });

    return { nodes, maxX, maxY };
  }, [ast, maxDepth, collapsedNodeIds]);

  // Synchronize selection when selectedLine in editor changes
  useEffect(() => {
    if (selectedLine !== null) {
      // Find deepest matching AST node containing this line
      let matchedNode: ASTNode | null = null;
      let minSpan = 999999;

      function searchLine(n: ASTNode) {
        if (selectedLine! >= n.lineStart && selectedLine! <= n.lineEnd) {
          const span = n.lineEnd - n.lineStart;
          if (span <= minSpan) {
            minSpan = span;
            matchedNode = n;
          }
        }
        n.children.forEach(searchLine);
      }

      searchLine(ast);
      if (matchedNode) {
        onSelectNode(matchedNode);
      }
    }
  }, [selectedLine, ast]);

  return (
    <div className="flex flex-col h-full bg-[#0d1117] text-slate-200 select-none overflow-hidden relative border-l border-[#30363d]">
      {/* Visualizer Top Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 bg-[#161b22] border-b border-[#30363d] gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-300">
            <Cpu className="w-4 h-4 text-purple-400" />
            <span>AST Visualizer</span>
          </div>

          <div className="flex items-center bg-[#0d1117] border border-[#30363d] rounded-md p-0.5 ml-2 text-xs">
            <button
              onClick={() => setViewMode('graph')}
              className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                viewMode === 'graph' ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Graph Map
            </button>
            <button
              onClick={() => setViewMode('tree')}
              className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                viewMode === 'tree' ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Hierarchy Tree
            </button>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2">
          {/* Search box */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2 top-2 text-slate-400" />
            <input
              type="text"
              placeholder="Filter nodes (for, if, malloc)..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="bg-[#0b0e14] border border-[#30363d] text-xs text-slate-200 rounded-md pl-7 pr-2 py-1 w-44 focus:outline-none focus:border-purple-500 placeholder:text-slate-500"
            />
          </div>

          {/* Depth limit */}
          <div className="flex items-center gap-1 bg-[#0d1117] border border-[#30363d] rounded px-2 py-0.5 text-xs text-slate-300">
            <span className="text-slate-400 text-[10px]">Depth:</span>
            <select
              value={maxDepth}
              onChange={e => setMaxDepth(Number(e.target.value))}
              className="bg-transparent text-xs text-purple-300 focus:outline-none cursor-pointer"
            >
              <option value={2} className="bg-[#161b22]">2</option>
              <option value={4} className="bg-[#161b22]">4</option>
              <option value={6} className="bg-[#161b22]">6 (All)</option>
              <option value={8} className="bg-[#161b22]">8 (Deep)</option>
            </select>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-1 border-l border-[#30363d] pl-2">
            <button
              onClick={() => handleZoom(0.15)}
              title="Zoom In"
              className="p-1.5 hover:bg-[#21262d] text-slate-400 hover:text-slate-200 rounded transition-colors"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => handleZoom(-0.15)}
              title="Zoom Out"
              className="p-1.5 hover:bg-[#21262d] text-slate-400 hover:text-slate-200 rounded transition-colors"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={resetView}
              title="Reset Zoom & Pan"
              className="p-1.5 hover:bg-[#21262d] text-slate-400 hover:text-slate-200 rounded transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={expandAll}
              title="Expand All Nodes"
              className="px-1.5 py-0.5 text-[10px] bg-[#21262d] text-slate-300 hover:bg-[#30363d] rounded transition-colors"
            >
              Expand All
            </button>
            <button
              onClick={collapseAll}
              title="Collapse All Nodes"
              className="px-1.5 py-0.5 text-[10px] bg-[#21262d] text-slate-300 hover:bg-[#30363d] rounded transition-colors"
            >
              Collapse
            </button>
          </div>
        </div>
      </div>

      {/* Main Viewport */}
      {viewMode === 'graph' ? (
        <div
          ref={containerRef}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          className={`flex-1 overflow-hidden relative cursor-${isDragging ? 'grabbing' : 'grab'} bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:24px_24px]`}
        >
          {/* Zoom Info overlay */}
          <div className="absolute bottom-3 left-3 z-10 px-2 py-1 bg-[#161b22]/80 backdrop-blur border border-[#30363d] rounded text-[11px] text-slate-400 flex items-center gap-2 pointer-events-none">
            <span>Zoom: {Math.round(zoom * 100)}%</span>
            <span>•</span>
            <span>Drag canvas to pan</span>
            <span>•</span>
            <span>Click node to sync code</span>
          </div>

          {/* Canvas container with pan & zoom transform */}
          <div
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: '0 0',
              transition: isDragging ? 'none' : 'transform 0.08s ease-out',
              width: layout.maxX,
              height: layout.maxY,
              position: 'absolute'
            }}
          >
            {/* SVG Connecting Bezier Splines */}
            <svg
              className="absolute inset-0 pointer-events-none overflow-visible"
              width={layout.maxX}
              height={layout.maxY}
            >
              <defs>
                <linearGradient id="edgeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#4f46e5" stopOpacity="0.4" />
                  <stop offset="100%" stopColor="#818cf8" stopOpacity="0.6" />
                </linearGradient>
              </defs>

              {layout.nodes.map(item => {
                if (!item.parent) return null;
                const p = item.parent;
                const x1 = p.x + p.width;
                const y1 = p.y + p.height / 2;
                const x2 = item.x;
                const y2 = item.y + item.height / 2;
                const c1x = x1 + (x2 - x1) * 0.5;
                const c1y = y1;
                const c2x = x1 + (x2 - x1) * 0.5;
                const c2y = y2;
                const d = `M ${x1} ${y1} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${x2} ${y2}`;

                const isConnectedToActive =
                  activeNode && (activeNode.id === item.node.id || activeNode.id === p.node.id);

                return (
                  <path
                    key={`edge_${item.node.id}`}
                    d={d}
                    fill="none"
                    stroke={isConnectedToActive ? '#38bdf8' : 'rgba(75, 85, 99, 0.45)'}
                    strokeWidth={isConnectedToActive ? 2.5 : 1.5}
                    strokeDasharray={isConnectedToActive ? 'none' : '3 3'}
                    className="transition-all duration-200"
                  />
                );
              })}
            </svg>

            {/* AST Node Cards */}
            {layout.nodes.map(item => {
              const node = item.node;
              const style = CATEGORY_STYLES[node.category] || CATEGORY_STYLES.statement;
              const isSelected = activeNode?.id === node.id;
              const matchesSearch =
                searchTerm &&
                (node.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
                 node.type.toLowerCase().includes(searchTerm.toLowerCase()) ||
                 (node.detail && node.detail.toLowerCase().includes(searchTerm.toLowerCase())));

              return (
                <div
                  key={item.node.id}
                  onClick={e => {
                    e.stopPropagation();
                    onSelectNode(node);
                  }}
                  style={{
                    position: 'absolute',
                    left: `${item.x}px`,
                    top: `${item.y}px`,
                    width: `${item.width}px`,
                    height: `${item.height}px`,
                    boxShadow: isSelected
                      ? `0 0 20px ${style.glow}, 0 0 8px #38bdf8`
                      : matchesSearch
                      ? `0 0 15px rgba(234, 179, 8, 0.5)`
                      : '0 4px 12px rgba(0, 0, 0, 0.35)'
                  }}
                  className={`rounded-lg border p-2.5 cursor-pointer transition-all duration-150 backdrop-blur-md flex flex-col justify-between ${
                    style.bg
                  } ${
                    isSelected
                      ? 'border-cyan-400 ring-2 ring-cyan-400/50 scale-[1.03]'
                      : matchesSearch
                      ? 'border-yellow-400 ring-2 ring-yellow-400/40'
                      : style.border
                  } hover:scale-[1.02] hover:border-slate-300`}
                >
                  {/* Top Bar: Category badge & Line Indicator */}
                  <div className="flex items-center justify-between text-[10px]">
                    <span className={`px-1.5 py-0.5 rounded font-mono font-semibold uppercase tracking-wider ${style.badge}`}>
                      {node.category}
                    </span>
                    <span className="text-slate-400 font-mono text-[11px] bg-black/40 px-1 rounded">
                      L{node.lineStart}{node.lineEnd !== node.lineStart ? `-${node.lineEnd}` : ''}
                    </span>
                  </div>

                  {/* Node Title / Label */}
                  <div className="my-1">
                    <div className="text-xs font-mono font-semibold truncate text-slate-100" title={node.label}>
                      {node.label}
                    </div>
                    {node.detail && (
                      <div className="text-[10px] text-slate-400 truncate mt-0.5" title={node.detail}>
                        {node.detail}
                      </div>
                    )}
                  </div>

                  {/* Bottom Bar: Node Type & Sub-node controls */}
                  <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-slate-700/50">
                    <span className="truncate font-mono text-[10px] text-slate-400">
                      {node.type}
                    </span>

                    {node.children.length > 0 && (
                      <button
                        onClick={e => toggleCollapse(node.id, e)}
                        className="flex items-center gap-0.5 px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[10px] transition-colors"
                        title={item.collapsed ? 'Expand branch' : 'Collapse branch'}
                      >
                        {item.collapsed ? (
                          <>
                            <ChevronRight className="w-3 h-3 text-cyan-400" />
                            <span>+{node.children.length}</span>
                          </>
                        ) : (
                          <>
                            <ChevronDown className="w-3 h-3 text-slate-400" />
                            <span>{node.children.length}</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* Hierarchical Tree List View */
        <div className="flex-1 overflow-y-auto p-4 space-y-1 font-mono text-xs">
          <TreeNodeRenderer
            node={ast}
            depth={0}
            searchTerm={searchTerm}
            activeNode={activeNode}
            onSelectNode={onSelectNode}
            collapsedNodeIds={collapsedNodeIds}
            toggleCollapse={toggleCollapse}
          />
        </div>
      )}

      {/* Selected Node Details Drawer at bottom of AST */}
      {activeNode && (
        <div className="bg-[#161b22] border-t border-[#30363d] p-3 text-xs flex items-center justify-between gap-3 animate-fade-in shadow-xl">
          <div className="flex items-center gap-2 overflow-hidden">
            <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
              CATEGORY_STYLES[activeNode.category]?.badge || 'bg-slate-800 text-slate-300'
            }`}>
              {activeNode.category}
            </span>
            <div className="overflow-hidden">
              <span className="font-semibold text-slate-100 font-mono">{activeNode.label}</span>
              <span className="text-slate-400 text-[11px] ml-2">({activeNode.type} at lines {activeNode.lineStart}-{activeNode.lineEnd})</span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[11px] text-cyan-400 font-sans hidden sm:inline">
              Editor lines {activeNode.lineStart}-{activeNode.lineEnd} highlighted
            </span>
            <button
              onClick={() => onSelectNode(null)}
              className="px-2 py-0.5 text-xs text-slate-400 hover:text-slate-200 bg-[#21262d] hover:bg-[#30363d] rounded"
            >
              Clear
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// Recursive Component for Tree View Mode
interface TreeNodeProps {
  node: ASTNode;
  depth: number;
  searchTerm: string;
  activeNode: ASTNode | null;
  onSelectNode: (node: ASTNode) => void;
  collapsedNodeIds: Set<string>;
  toggleCollapse: (id: string, e: React.MouseEvent) => void;
}

const TreeNodeRenderer: React.FC<TreeNodeProps> = ({
  node,
  depth,
  searchTerm,
  activeNode,
  onSelectNode,
  collapsedNodeIds,
  toggleCollapse
}) => {
  const isCollapsed = collapsedNodeIds.has(node.id);
  const isSelected = activeNode?.id === node.id;
  const style = CATEGORY_STYLES[node.category] || CATEGORY_STYLES.statement;

  const matches =
    searchTerm &&
    (node.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
     node.type.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <div className="select-none">
      <div
        onClick={() => onSelectNode(node)}
        style={{ paddingLeft: `${depth * 20 + 8}px` }}
        className={`flex items-center justify-between py-1.5 pr-3 rounded cursor-pointer transition-colors group ${
          isSelected
            ? 'bg-cyan-950/60 border border-cyan-500/60 text-cyan-200'
            : matches
            ? 'bg-yellow-950/40 border border-yellow-500/40 text-yellow-200'
            : 'hover:bg-[#161b22] text-slate-300'
        }`}
      >
        <div className="flex items-center gap-1.5 overflow-hidden">
          {node.children.length > 0 ? (
            <button
              onClick={e => toggleCollapse(node.id, e)}
              className="p-0.5 text-slate-400 hover:text-slate-200 rounded"
            >
              {isCollapsed ? (
                <ChevronRight className="w-3.5 h-3.5 text-cyan-400" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              )}
            </button>
          ) : (
            <span className="w-4" />
          )}

          <span className={`px-1.5 py-0.2 rounded text-[9px] uppercase font-bold ${style.badge}`}>
            {node.category}
          </span>

          <span className="font-semibold text-slate-200 truncate">{node.label}</span>
          <span className="text-[10px] text-slate-500 truncate hidden group-hover:inline">
            ({node.type})
          </span>
        </div>

        <span className="text-[10px] text-slate-500 font-mono shrink-0 ml-2">
          L{node.lineStart}
        </span>
      </div>

      {!isCollapsed && node.children.length > 0 && (
        <div className="border-l border-slate-800 ml-4">
          {node.children.map(child => (
            <TreeNodeRenderer
              key={child.id}
              node={child}
              depth={depth + 1}
              searchTerm={searchTerm}
              activeNode={activeNode}
              onSelectNode={onSelectNode}
              collapsedNodeIds={collapsedNodeIds}
              toggleCollapse={toggleCollapse}
            />
          ))}
        </div>
      )}
    </div>
  );
};
