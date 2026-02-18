import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

// Global styles
const style = document.createElement("style");
style.textContent = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #0a0a0f; overflow: hidden; }
  @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
  ::-webkit-scrollbar { width: 6px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: #2a2a3a; border-radius: 3px; }
  ::-webkit-scrollbar-thumb:hover { background: #3a3a4a; }
  textarea::placeholder, input::placeholder { color: #555570; }
`;
document.head.appendChild(style);

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
