import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
// Ordem importa: a demo (index.css) vem depois e manda nos tokens globais;
// a landing reaplica os dela dentro de .landing-root (ver landing.css).
import './landing/landing.css'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
