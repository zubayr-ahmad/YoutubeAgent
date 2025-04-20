# YouTube Agent — MCP Server for YouTube Interaction

An extensible [Model Context Protocol (MCP)](https://modelcontextprotocol.org) server‑agent that lets you interact with YouTube videos: fetch transcripts, ask questions, generate summaries, extract key points, create note files, and even manage folders and files — all within a scoped, secure directory.

---

## 🚀 Features

- 🎥 **Transcript Fetching:** Retrieve closed captions/subtitles for a given YouTube video URL.  
- ❓ **Q&A:** Answer user questions based on transcript content using keyword matching.  
- ✍️ **Summarization:** Generate concise summaries of video content via word‑frequency scoring.  
- 📌 **Key Point Extraction:** Identify potential key points using frequency analysis and trigger phrases.  
- 🗒️ **Notes Creation:** Produce a structured `.txt` file (title, summary, key points, transcript excerpts) in a `notes/` subdirectory.  
- 💬 **Chat Context:** Maintain a short conversation history for the `chat_with_video` tool.  
- 🔒 **Security:** Restrict all file‑system operations (creating/updating/deleting) to a single “allowed” directory passed at startup.  
- ⚙️ **MCP Compliance:** Implements an MCP server with `@modelcontextprotocol/sdk` over stdio, exposing tools for programmatic use.  
- 📂 **File & Folder Management:** Create, delete, or overwrite folders and files within the allowed directory to organize notes and transcripts.

---

## 📁 Directory Structure

When you launch the agent, you specify one allowed directory (e.g. `~/youtube-agent-data`). Inside it:

```
<allowed-dir>/
├─ notes/        ← Generated `.txt` note files
└─ (optional)    ← You may add subdirectories or store raw transcripts here
```

The agent will auto‑create the `notes/` folder if it doesn’t exist.

---

## 🛠️ Tools & Capabilities

| Tool                   | Description                                                                          |
|------------------------|--------------------------------------------------------------------------------------|
| `fetch_transcript`     | Download captions/subtitles for a YouTube video.                                     |
| `ask_question`         | Answer a user’s question by searching the transcript text.                           |
| `summarize_video`      | Produce a high‑level summary based on transcript word frequencies.                   |
| `extract_key_points`   | Identify salient points using keyword triggers and frequency analysis.               |
| `create_notes`         | Generate and save a `.txt` file with title, summary, key points, and excerpts.       |
| `chat_with_video`      | Maintain conversational context across multiple Q&A calls.                          |
| `create_directory`     | Create a new folder anywhere under the allowed directory (recursive).                |
| `delete_file`          | Remove a file from within the allowed directory.                                     |
| `write_file`           | Create or overwrite a file in the allowed directory (used for note and transcript).  |

---

## ⚙️ Setup & Running

### 1. Clone the repository
```bash
git git@github.com:zubayr-ahmad/YoutubeAgent.git
cd YoutubeAgent
```

### 2. Install dependencies
```bash
npm install
pnpm install
```

### 3. Build the project
```bash
npm run build
```

### 4. Run the MCP Agent (TypeScript via ts‑node)
```bash
npx -y supergateway --stdio "node ./dist/index.js ." --port 8000 --baseUrl "http://localhost" --ssePath /sse --messagePath /message --cors "*"
```

### 5. (Optional) Expose Locally with ngrok
```bash
ngrok http 8000
```

---

## 📦 Tech Stack

- **Node.js & TypeScript**  
- **@modelcontextprotocol/sdk** for MCP server integration  
- **Zod** for request/input validation  
- **youtube‑transcript** (or `node-fetch`) for fetching captions  
- **diff** & **minimatch** for future extensions  

---

## 🧰 Development Tips

- All file‑system operations are gated by `validatePath()` to enforce your allowed directory.  
- Conversation context for `chat_with_video` is kept in memory—consider persisting if you need long‑term history.  
- Extend the `CallToolRequestSchema` switch‑case to add new tools (e.g., advanced NLP, embedding-based search).  

---

## 🤝 Contributing

PRs, issues, and ideas are welcome! Feel free to add new tools, improve parsing logic, or integrate with other platforms.

---

## 📄 License

[MIT License](LICENSE) © 2025 Muhammad Zubair
