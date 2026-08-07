import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import ToolApp from './ToolApp';
import './styles.css';

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('找不到 #root 节点');
}

createRoot(rootEl).render(
  <StrictMode>
    <ToolApp />
  </StrictMode>,
);
