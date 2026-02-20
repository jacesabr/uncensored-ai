import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

const style = document.createElement("style");
style.textContent = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #0D0D0D; overflow: hidden; color: #E8E0D8; }
  @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
  ::-webkit-scrollbar { width: 6px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: #333333; border-radius: 3px; }
  ::-webkit-scrollbar-thumb:hover { background: #3D3D3D; }
  textarea::placeholder, input::placeholder { color: #6B6560; }
`;
document.head.appendChild(style);

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);