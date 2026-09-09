import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { PrivateApp } from './PrivateApp';
import '../styles/app.css';
import './private.css';

createRoot(document.getElementById('root')!).render(<StrictMode><PrivateApp /></StrictMode>);
