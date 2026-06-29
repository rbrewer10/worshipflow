import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { installBrowserWfMock } from './browserWfMock'
import './assets/main.css'

installBrowserWfMock(window)

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
