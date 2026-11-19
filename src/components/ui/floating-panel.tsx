import React, { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "./button";
import { X, Minus, Maximize2, GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";

interface FloatingPanelProps {
  id: string;
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  defaultPosition?: { x: number; y: number };
  defaultSize?: { width: number; height: number };
  minWidth?: number;
  minHeight?: number;
  isOpen: boolean;
  onClose: () => void;
  className?: string;
  collapsible?: boolean;
}

export function FloatingPanel({
  id,
  title,
  icon,
  children,
  defaultPosition = { x: 20, y: 80 },
  defaultSize = { width: 280, height: 400 },
  minWidth = 200,
  minHeight = 100,
  isOpen,
  onClose,
  className,
  collapsible = true,
}: FloatingPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState(defaultPosition);
  const [size, setSize] = useState(defaultSize);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, posX: 0, posY: 0 });
  const resizeStart = useRef({ x: 0, y: 0, w: 0, h: 0 });

  // Load saved position from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(`panel-${id}`);
    if (saved) {
      try {
        const data = JSON.parse(saved);
        if (data.position) setPosition(data.position);
        if (data.size) setSize(data.size);
        if (typeof data.isCollapsed === "boolean") setIsCollapsed(data.isCollapsed);
      } catch { /* ignore malformed saved panel state */ }
    }
  }, [id]);

  // Save position to localStorage
  useEffect(() => {
    if (!isDragging && !isResizing) {
      localStorage.setItem(`panel-${id}`, JSON.stringify({ position, size, isCollapsed }));
    }
  }, [id, position, size, isCollapsed, isDragging, isResizing]);

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    e.preventDefault();
    setIsDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY, posX: position.x, posY: position.y };
  }, [position]);

  const handleDrag = useCallback((e: MouseEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    setPosition({
      x: Math.max(0, dragStart.current.posX + dx),
      y: Math.max(0, dragStart.current.posY + dy),
    });
  }, [isDragging]);

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    resizeStart.current = { x: e.clientX, y: e.clientY, w: size.width, h: size.height };
  }, [size]);

  const handleResize = useCallback((e: MouseEvent) => {
    if (!isResizing) return;
    const dx = e.clientX - resizeStart.current.x;
    const dy = e.clientY - resizeStart.current.y;
    setSize({
      width: Math.max(minWidth, resizeStart.current.w + dx),
      height: Math.max(minHeight, resizeStart.current.h + dy),
    });
  }, [isResizing, minWidth, minHeight]);

  const handleResizeEnd = useCallback(() => {
    setIsResizing(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener("mousemove", handleDrag);
      window.addEventListener("mouseup", handleDragEnd);
      return () => {
        window.removeEventListener("mousemove", handleDrag);
        window.removeEventListener("mouseup", handleDragEnd);
      };
    }
  }, [isDragging, handleDrag, handleDragEnd]);

  useEffect(() => {
    if (isResizing) {
      window.addEventListener("mousemove", handleResize);
      window.addEventListener("mouseup", handleResizeEnd);
      return () => {
        window.removeEventListener("mousemove", handleResize);
        window.removeEventListener("mouseup", handleResizeEnd);
      };
    }
  }, [isResizing, handleResize, handleResizeEnd]);

  if (!isOpen) return null;

  return (
    <div
      ref={panelRef}
      className={cn(
        "floating-panel fixed z-50 animate-panel-in",
        isDragging && "cursor-grabbing",
        className
      )}
      style={{
        left: position.x,
        top: position.y,
        width: size.width,
        height: isCollapsed ? "auto" : size.height,
      }}
    >
      {/* Header */}
      <div
        className="floating-panel-header"
        onMouseDown={handleDragStart}
      >
        <div className="flex items-center gap-2">
          <GripVertical className="h-3 w-3 text-muted-foreground/50" />
          {icon}
          <span className="floating-panel-title">{title}</span>
        </div>
        <div className="flex items-center gap-1">
          {collapsible && (
            <Button
              variant="ghost"
              size="sm"
              className="h-5 w-5 p-0 hover:bg-secondary"
              onClick={() => setIsCollapsed(!isCollapsed)}
            >
              {isCollapsed ? (
                <Maximize2 className="h-3 w-3 text-muted-foreground" />
              ) : (
                <Minus className="h-3 w-3 text-muted-foreground" />
              )}
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-5 w-5 p-0 hover:bg-destructive/20 hover:text-destructive"
            onClick={onClose}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Content */}
      {!isCollapsed && (
        <div className="floating-panel-content overflow-auto scrollbar-thin" style={{ maxHeight: size.height - 40 }}>
          {children}
        </div>
      )}

      {/* Resize Handle */}
      {!isCollapsed && (
        <div
          className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize hover:bg-primary/20 rounded-br-lg"
          onMouseDown={handleResizeStart}
        >
          <svg
            className="absolute bottom-1 right-1 w-2 h-2 text-muted-foreground/50"
            viewBox="0 0 6 6"
            fill="currentColor"
          >
            <circle cx="5" cy="1" r="0.75" />
            <circle cx="1" cy="5" r="0.75" />
            <circle cx="5" cy="5" r="0.75" />
          </svg>
        </div>
      )}
    </div>
  );
}

// Panel toggle button for toolbar
interface PanelToggleProps {
  icon: React.ReactNode;
  label: string;
  isActive: boolean;
  onClick: () => void;
}

export function PanelToggle({ icon, label, isActive, onClick }: PanelToggleProps) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn(
        "toolbar-btn gap-1.5 w-auto px-2",
        isActive && "toolbar-btn-active"
      )}
      onClick={onClick}
      title={label}
    >
      {icon}
      <span className="text-[10px] uppercase tracking-wider hidden lg:inline">{label}</span>
    </Button>
  );
}
