import React, { useState, useRef } from 'react';

const TitleBar: React.FC = () => {
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const lastMove = useRef({ x: 0, y: 0 });
  const throttleRef = useRef<NodeJS.Timeout | null>(null);

  const handleMinimize = () => {
    window.BciGit.minimizeWindow();
  };

  const handleMaximize = () => {
    window.BciGit.maximizeWindow();
  };

  const handleClose = () => {
    window.BciGit.closeWindow();
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY };
    lastMove.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging && !throttleRef.current) {
      throttleRef.current = setTimeout(() => {
        const deltaX = e.clientX - lastMove.current.x;
        const deltaY = e.clientY - lastMove.current.y;
        if (Math.abs(deltaX) > 0 || Math.abs(deltaY) > 0) {
          window.BciGit.moveWindow(deltaX, deltaY);
          lastMove.current = { x: e.clientX, y: e.clientY };
        }
        throttleRef.current = null;
      }, 16); // ~60fps
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    if (throttleRef.current) {
      clearTimeout(throttleRef.current);
      throttleRef.current = null;
    }
  };

  return (
    <div
      className="flex items-center justify-between bg-slate-800 px-4 py-2 select-none cursor-move"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <div className="text-sm font-medium">BciGit</div>
      <div className="flex space-x-2">
        <button
          onClick={handleMinimize}
          className="w-8 h-8 flex items-center justify-center hover:bg-slate-700 rounded"
          title="Minimiser"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
            <path d="M2 6h8v1H2z" />
          </svg>
        </button>
        <button
          onClick={handleMaximize}
          className="w-8 h-8 flex items-center justify-center hover:bg-slate-700 rounded"
          title="Maximiser"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
            <path d="M3 3v6h6V3H3zm1 1h4v4H4V4z" />
          </svg>
        </button>
        <button
          onClick={handleClose}
          className="w-8 h-8 flex items-center justify-center hover:bg-red-600 rounded"
          title="Fermer"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
            <path d="M3.5 3.5l5 5M8.5 3.5l-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
};

export default TitleBar;