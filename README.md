YouTube Transcript Agent — MCP Server
YouTube Transcript Agent is a robust Model Context Protocol (MCP) server designed to enhance your interaction with YouTube videos. It enables users to fetch transcripts, ask questions, generate summaries, extract key points, create structured notes, and manage files securely within a scoped directory.

🚀 Features

📜 Transcript Fetching: Retrieves closed captions/subtitles for any YouTube video using its URL.
❓ Q&A: Answers questions based on video transcripts using keyword matching.
📝 Summarization: Generates concise summaries of video content using word frequency scoring.
🔑 Key Point Extraction: Identifies key points with word frequency and trigger phrases like "what is" or "important."
📋 Notes Creation: Creates .txt files with a title, summary, key points, and transcript excerpts, saved in a notes subdirectory.
💬 Chat Context: Maintains a short conversation history for interactive video chats.
🔒 Security: Restricts file operations to a user-specified allowed directory for safety.
🌐 MCP Compliance: Implements a fully compliant MCP server using @modelcontextprotocol/sdk, communicating over stdio.
📁 Create/Delete/Update Folders and Files: Manages notes and transcripts within the allowed directory.


📁 Directory Structure
The agent uses a single scoped directory provided at startup for secure file operations:

<allowed-directory>/ — Stores cached transcripts.
<allowed-directory>/notes/ — Stores generated note files.

The notes subdirectory is auto-created when generating notes, with appropriate permissions.

🛠️ Tools & Capabilities



Tool
Description



fetch_transcript
Fetch the transcript of a YouTube video given its URL.


answer_question
Answer a question based on the video’s transcript content.


generate_summary
Generate a concise summary of the video’s transcript.


extract_keypoints
Extract key points from the video’s transcript.


chat_with_video
Engage in a conversational chat about the video, with context history.


create_video_notes
Create a .txt file with structured notes, saved in the notes subdirectory.



🧪 Supported File Types

.txt (for generated notes and cached transcripts)


⚙️ Setup & Running
1. Clone the repository
git clone https://github.com/zubayr-ahmad/YoutubeAgent.git
cd youtube-transcript-agent

2. Install dependencies
npm install
pnpm install

3. Build the project
npm run build

4. Run the MCP Agent (Option 1)
npx -y supergateway --stdio "uvx mcp-server-youtube /path/to/allowed-directory"

5. Run the MCP Agent (Option 2 with compiled JS)
npx -y supergateway --stdio "node ./dist/index.js /path/to/allowed-directory" --port 8000 --baseUrl "http://localhost" --ssePath /sse --messagePath /message --cors "*"

6. Optional: Expose Locally Running Server
ngrok http 8000


📦 Tech Stack

Node.js
TypeScript
Zod for input validation
Node-fetch for YouTube API calls
Xmldom for XML parsing
MCP SDK for agent-server communication



🧰 Development Tips

All file paths are validated and scoped to the allowed directory for security.
The notes subdirectory is automatically created when using create_video_notes.
Extend the CallToolRequestSchema handler to add more capabilities.


🤝 Contributing
Pull requests and ideas are welcome! Let’s make YouTube video interaction smarter together.

📄 License
MIT License © 2025 Muhammad Zubair.
