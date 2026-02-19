import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

const style = document.createElement("style");
style.textContent = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #FBF8F4; overflow: hidden; }
  @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
  ::-webkit-scrollbar { width: 6px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: #E0D8CE; border-radius: 3px; }
  ::-webkit-scrollbar-thumb:hover { background: #D0C8BE; }
  textarea::placeholder, input::placeholder { color: #A8A29E; }
`;
document.head.appendChild(style);

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);