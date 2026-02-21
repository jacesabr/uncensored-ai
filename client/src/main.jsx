import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

const style = document.createElement("style");
style.textContent = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #0A0A0C; overflow: hidden; color: #E2DAD0; font-family: 'Crimson Pro', Georgia, serif; }
  @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
  ::-webkit-scrollbar { width: 5px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: #2A2A33; border-radius: 3px; }
  ::-webkit-scrollbar-thumb:hover { background: #3A3A44; }
  textarea::placeholder, input::placeholder { color: #5E5A56; }
`;
document.head.appendChild(style);

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);