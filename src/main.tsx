import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import App from './App';
import GlobalWheelWindow from './GlobalWheelWindow';
const root = createRoot(document.getElementById('root')!);
const isGlobalWheel = new URLSearchParams(window.location.search).get('santara-wheel') === '1';
if (isGlobalWheel) document.documentElement.classList.add('global-wheel-document');
root.render(<React.StrictMode>{isGlobalWheel ? <GlobalWheelWindow /> : <App />}</React.StrictMode>);
