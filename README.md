# YouTube Agent (MCP Server)

This project implements a Model Context Protocol (MCP) server that acts as an agent for interacting with YouTube videos. It allows users to fetch transcripts, ask questions, generate summaries, extract key points, create notes, and search within videos.

## Features

*   **Transcript Fetching:** Retrieves closed captions/subtitles for a given YouTube video URL.
*   **Q&A:** Answers questions based on the transcript content using basic keyword matching.
*   **Summarization:** Generates a concise summary based on word frequency scoring.
*   **Key Point Extraction:** Identifies potential key points using word frequency and specific trigger phrases.
*   **Notes Creation:** Generates a text file (`.txt`) containing a title, summary, key points, and transcript excerpts, saved within a `notes` subdirectory of the allowed directory.
*   **Chat Context:** Maintains a short conversation history for the `chat_with_video` tool.
*   **Security:** Restricts file system operations (note creation) to a specified allowed directory provided at startup.
*   **MCP Compliance:** Implements an MCP server using `@modelcontextprotocol/sdk`, communicating over stdio.

*   **Create/Delete/Update Folders and Files:** Allows the creation, deletion, and updating of folders and files within the allowed directory to manage notes and transcripts.