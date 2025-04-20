#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ToolSchema,
} from "@modelcontextprotocol/sdk/types.js";
import fetch from "node-fetch";
import { DOMParser } from "xmldom";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

// Command line argument parsing
const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("Usage: mcp-server-youtube <allowed-directory>");
  process.exit(1);
}

// Normalize all paths consistently
function normalizePath(p: string): string {
  return path.normalize(p);
}

function expandHome(filepath: string): string {
  if (filepath.startsWith("~/") || filepath === "~") {
    return path.join(os.homedir(), filepath.slice(1));
  }
  return filepath;
}

// Store allowed directory in normalized form
const allowedDirectory = normalizePath(path.resolve(expandHome(args[0])));

// Validate that the directory exists and is accessible
async function validateDirectory() {
  try {
    const stats = await fs.stat(allowedDirectory);
    if (!stats.isDirectory()) {
      console.error(`Error: ${allowedDirectory} is not a directory`);
      process.exit(1);
    }
  } catch (error) {
    console.error(`Error accessing directory ${allowedDirectory}:`, error);
    process.exit(1);
  }
}

// Security utilities
async function validatePath(requestedPath: string): Promise<string> {
  const expandedPath = expandHome(requestedPath);
  const absolute = path.isAbsolute(expandedPath)
    ? path.resolve(expandedPath)
    : path.resolve(allowedDirectory, expandedPath);

  const normalizedRequested = normalizePath(absolute);

  if (!normalizedRequested.startsWith(allowedDirectory)) {
    throw new Error(
      `Access denied - path outside allowed directory: ${absolute} not in ${allowedDirectory}`
    );
  }

  try {
    const realPath = await fs.realpath(absolute);
    const normalizedReal = normalizePath(realPath);
    if (!normalizedReal.startsWith(allowedDirectory)) {
      throw new Error("Access denied - symlink target outside allowed directory");
    }
    return realPath;
  } catch (error) {
    const parentDir = path.dirname(absolute);
    try {
      const realParentPath = await fs.realpath(parentDir);
      const normalizedParent = normalizePath(realParentPath);
      if (!normalizedParent.startsWith(allowedDirectory)) {
        throw new Error("Access denied - parent directory outside allowed directory");
      }
      return absolute;
    } catch {
      throw new Error(`Parent directory does not exist: ${parentDir}`);
    }
  }
}

// Validate YouTube URL
function validateYouTubeUrl(url: string): boolean {
  const regex = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/(watch\?v=)?[A-Za-z0-9_-]+/;
  return regex.test(url);
}

// Sanitize file name
function sanitizeFileName(name: string): string {
  const maxLength = 100;
  return name
    .replace(/[^a-zA-Z0-9\s_-]/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, maxLength)
    .replace(/^_+|_+$/g, "");
}

// Convert seconds to HMS format
function convertSecondsToHMS(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s
    .toString()
    .padStart(2, "0")}`;
}

// Fetch YouTube transcript
async function copyTranscript(youtubeUrl: string): Promise<string> {
  try {
    const response = await fetch(youtubeUrl);
    const text = await response.text();

    const match = text.match(/"captionTracks":(.+?)]/);
    if (!match) return "Transcript not available";

    const captionTracks = JSON.parse(match[1] + "]") as Array<{
      baseUrl: string;
    }>;

    if (!captionTracks || captionTracks.length === 0) {
      return "No transcript available for this video";
    }

    const baseUrl = captionTracks[0].baseUrl.replace(/\\u0026/g, "&");
    const transcriptResponse = await fetch(baseUrl);
    const transcriptText = await transcriptResponse.text();

    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(transcriptText, "text/xml");
    const textElements = xmlDoc.getElementsByTagName("text");

    let transcript = "";
    for (let i = 0; i < textElements.length; i++) {
      const start = parseFloat(textElements[i].getAttribute("start") || "0").toFixed(2);
      transcript += `[${convertSecondsToHMS(parseFloat(start))}] ${textElements[i].textContent}\n`;
    }

    return transcript.trim();
  } catch (error) {
    console.error("Error copying transcript:", error);
    return "Error getting transcript";
  }
}

// Schema definitions
const FetchTranscriptArgsSchema = z.object({
  youtubeUrl: z.string().refine(validateYouTubeUrl, {
    message: "Invalid YouTube URL",
  }),
});

const AnswerQuestionArgsSchema = z.object({
  youtubeUrl: z.string().refine(validateYouTubeUrl, {
    message: "Invalid YouTube URL",
  }),
  question: z.string(),
});

const GenerateSummaryArgsSchema = z.object({
  youtubeUrl: z.string().refine(validateYouTubeUrl, {
    message: "Invalid YouTube URL",
  }),
});

const ExtractKeypointsArgsSchema = z.object({
  youtubeUrl: z.string().refine(validateYouTubeUrl, {
    message: "Invalid YouTube URL",
  }),
});

const ChatWithVideoArgsSchema = z.object({
  youtubeUrl: z.string().refine(validateYouTubeUrl, {
    message: "Invalid YouTube URL",
  }),
  message: z.string(),
});

const CreateVideoNotesArgsSchema = z.object({
  youtubeUrl: z.string().refine(validateYouTubeUrl, {
    message: "Invalid YouTube URL",
  }),
  customTitle: z.string().optional().describe("Optional custom title for the notes file"),
});

const FindInVideoArgsSchema = z.object({
  youtubeUrl: z.string().refine(validateYouTubeUrl, {
    message: "Invalid YouTube URL",
  }),
  query: z.string().describe("Phrase, sentence, or topic to search for in the video"),
});

const ListYouTubeFunctionalitiesArgsSchema = z.object({});

const ToolInputSchema = ToolSchema.shape.inputSchema;
type ToolInput = z.infer<typeof ToolInputSchema>;

// Server setup
const server = new Server(
  {
    name: "youtube-transcript-agent",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Transcript and chat context cache
const transcriptCache: Map<string, string> = new Map();
const chatContext: Map<
  string,
  Array<{ question: string; answer: string }>
> = new Map();

// Text processing utilities
function answerFromTranscript(question: string, transcript: string): string {
  const normalizedQuestion = question.toLowerCase();
  const lines = transcript.split("\n").filter((line) => line.trim());

  const questionWords = normalizedQuestion
    .split(/\s+/)
    .filter((word) => word.length > 3);

  const relevantLines = lines.filter((line) =>
    questionWords.some((word) => line.toLowerCase().includes(word))
  );

  return (
    relevantLines.slice(0, 2).join("\n") ||
    "No relevant information found in the transcript."
  );
}

function generateSummary(transcript: string): string {
  const lines = transcript
    .split("\n")
    .map((line) => line.replace(/^\[\d+:\d+:\d+\]\s*/, "").trim())
    .filter((line) => line);

  // Simple word frequency scoring
  const wordFreq: Map<string, number> = new Map();
  lines.forEach((line) => {
    const words = line.toLowerCase().split(/\s+/);
    words.forEach((word) => {
      if (word.length > 3) {
        wordFreq.set(word, (wordFreq.get(word) || 0) + 1);
      }
    });
  });

  // Score sentences based on frequent words
  const scoredLines = lines.map((line) => {
    const words = line.toLowerCase().split(/\s+/);
    const score = words.reduce(
      (sum, word) => sum + (wordFreq.get(word) || 0),
      0
    );
    return { line, score };
  });

  // Select top 3 sentences
  const summaryLines = scoredLines
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((item) => item.line);

  return (
    summaryLines.join(". ") || "Unable to generate summary from the transcript."
  );
}

function extractKeypoints(transcript: string): string {
  const lines = transcript
    .split("\n")
    .map((line) => line.replace(/^\[\d+:\d+:\d+\]\s*/, "").trim())
    .filter((line) => line);

  // Identify key points based on specific patterns or high-frequency terms
  const wordFreq: Map<string, number> = new Map();
  lines.forEach((line) => {
    const words = line.toLowerCase().split(/\s+/);
    words.forEach((word) => {
      if (word.length > 3) {
        wordFreq.set(word, (wordFreq.get(word) || 0) + 1);
      }
    });
  });

  // Select lines with high-frequency words or starting with key phrases
  const keyPhrases = ["what is", "how to", "key", "important", "definition"];
  const keypoints = lines
    .map((line) => {
      const words = line.toLowerCase().split(/\s+/);
      const score = words.reduce(
        (sum, word) => sum + (wordFreq.get(word) || 0),
        0
      );
      const hasKeyPhrase = keyPhrases.some((phrase) =>
        line.toLowerCase().startsWith(phrase)
      );
      return { line, score: score + (hasKeyPhrase ? 10 : 0) };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((item) => `- ${item.line}`);

  return keypoints.length > 0
    ? keypoints.join("\n")
    : "No key points identified in the transcript.";
}

function generateTitle(transcript: string): string {
  const summary = generateSummary(transcript);
  const words = summary.split(/\s+/).slice(0, 5).join(" ");
  return words || "Video_Notes";
}

function findInVideo(query: string, transcript: string): string {
  const normalizedQuery = query.toLowerCase().trim();
  const lines = transcript.split("\n").filter((line) => line.trim());

  // For phrases/sentences, search for substring matches
  let matches: string[] = [];
  if (normalizedQuery.length > 10 || normalizedQuery.includes(" ")) {
    matches = lines.filter((line) =>
      line.toLowerCase().includes(normalizedQuery)
    );
  } else {
    // For topics, extract keywords and require multiple matches
    const queryWords = normalizedQuery
      .split(/\s+/)
      .filter((word) => word.length > 3);
    matches = lines.filter((line) => {
      const lineLower = line.toLowerCase();
      return queryWords.filter((word) => lineLower.includes(word)).length >= 2;
    });
  }

  // Return up to 5 matches
  return matches.length > 0
    ? matches.slice(0, 5).join("\n")
    : `No matches found for "${query}" in the transcript.`;
}

// Tool handlers
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "fetch_transcript",
        description:
          "Fetch the transcript of a YouTube video given its URL. The transcript is cached for subsequent operations.",
        inputSchema: zodToJsonSchema(FetchTranscriptArgsSchema) as ToolInput,
      },
      {
        name: "answer_question",
        description:
          "Answer a question based on the transcript of a YouTube video. Requires the video URL and the question.",
        inputSchema: zodToJsonSchema(AnswerQuestionArgsSchema) as ToolInput,
      },
      {
        name: "generate_summary",
        description:
          "Generate a concise summary of a YouTube video's transcript based on its URL.",
        inputSchema: zodToJsonSchema(GenerateSummaryArgsSchema) as ToolInput,
      },
      {
        name: "extract_keypoints",
        description:
          "Extract key points from a YouTube video's transcript based on its URL.",
        inputSchema: zodToJsonSchema(ExtractKeypointsArgsSchema) as ToolInput,
      },
      {
        name: "chat_with_video",
        description:
          "Engage in a conversational chat about a YouTube video, maintaining context across messages.",
        inputSchema: zodToJsonSchema(ChatWithVideoArgsSchema) as ToolInput,
      },
      {
        name: "create_video_notes",
        description:
          "Create a text file with comprehensive notes for a YouTube video, including summary, key points, and transcript excerpts. " +
          "The file is saved in the 'notes' subdirectory with a generated or custom title.",
        inputSchema: zodToJsonSchema(CreateVideoNotesArgsSchema) as ToolInput,
      },
      {
        name: "find_in_video",
        description:
          "Find where a specific phrase, sentence, or topic is discussed in a YouTube video's transcript. Returns timestamps and matching lines.",
        inputSchema: zodToJsonSchema(FindInVideoArgsSchema) as ToolInput,
      },
      {
        name: "list_youtube_functionalities",
        description:
          "List all available YouTube-related functionalities provided by this agent, including tool names and descriptions.",
        inputSchema: zodToJsonSchema(ListYouTubeFunctionalitiesArgsSchema) as ToolInput,
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const { name, arguments: args } = request.params;

    switch (name) {
      case "fetch_transcript": {
        const parsed = FetchTranscriptArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments for fetch_transcript: ${parsed.error}`);
        }
        const transcript = await copyTranscript(parsed.data.youtubeUrl);
        if (!transcript.startsWith("Error") && !transcript.includes("not available")) {
          transcriptCache.set(parsed.data.youtubeUrl, transcript);
          // Optionally save to file
          const fileName = `transcript_${parsed.data.youtubeUrl
            .split("v=")[1]
            ?.substring(0, 11)}.txt`;
          const filePath = path.join(allowedDirectory, fileName);
          await fs.writeFile(filePath, transcript, "utf-8");
        }
        return {
          content: [{ type: "text", text: transcript }],
        };
      }

      case "answer_question": {
        const parsed = AnswerQuestionArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments for answer_question: ${parsed.error}`);
        }
        let transcript = transcriptCache.get(parsed.data.youtubeUrl);
        if (!transcript) {
          transcript = await copyTranscript(parsed.data.youtubeUrl);
          if (transcript.startsWith("Error") || transcript.includes("not available")) {
            return {
              content: [{ type: "text", text: transcript }],
              isError: true,
            };
          }
          transcriptCache.set(parsed.data.youtubeUrl, transcript);
        }
        const answer = answerFromTranscript(parsed.data.question, transcript);
        return {
          content: [{ type: "text", text: answer }],
        };
      }

      case "generate_summary": {
        const parsed = GenerateSummaryArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments for generate_summary: ${parsed.error}`);
        }
        let transcript = transcriptCache.get(parsed.data.youtubeUrl);
        if (!transcript) {
          transcript = await copyTranscript(parsed.data.youtubeUrl);
          if (transcript.startsWith("Error") || transcript.includes("not available")) {
            return {
              content: [{ type: "text", text: transcript }],
              isError: true,
            };
          }
          transcriptCache.set(parsed.data.youtubeUrl, transcript);
        }
        const summary = generateSummary(transcript);
        return {
          content: [{ type: "text", text: summary }],
        };
      }

      case "extract_keypoints": {
        const parsed = ExtractKeypointsArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments for extract_keypoints: ${parsed.error}`);
        }
        let transcript = transcriptCache.get(parsed.data.youtubeUrl);
        if (!transcript) {
          transcript = await copyTranscript(parsed.data.youtubeUrl);
          if (transcript.startsWith("Error") || transcript.includes("not available")) {
            return {
              content: [{ type: "text", text: transcript }],
              isError: true,
            };
          }
          transcriptCache.set(parsed.data.youtubeUrl, transcript);
        }
        const keypoints = extractKeypoints(transcript);
        return {
          content: [{ type: "text", text: keypoints }],
        };
      }

      case "chat_with_video": {
        const parsed = ChatWithVideoArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments for chat_with_video: ${parsed.error}`);
        }
        let transcript = transcriptCache.get(parsed.data.youtubeUrl);
        if (!transcript) {
          transcript = await copyTranscript(parsed.data.youtubeUrl);
          if (transcript.startsWith("Error") || transcript.includes("not available")) {
            return {
              content: [{ type: "text", text: transcript }],
              isError: true,
            };
          }
          transcriptCache.set(parsed.data.youtubeUrl, transcript);
        }
        const answer = answerFromTranscript(parsed.data.message, transcript);

        // Update chat context (keep last 5 interactions)
        let context = chatContext.get(parsed.data.youtubeUrl) || [];
        context.push({ question: parsed.data.message, answer });
        if (context.length > 5) {
          context = context.slice(-5);
        }
        chatContext.set(parsed.data.youtubeUrl, context);

        // Include context in response if available
        const contextText =
          context.length > 1
            ? `\n\nPrevious context:\n${context
                .slice(0, -1)
                .map((c) => `Q: ${c.question}\nA: ${c.answer}`)
                .join("\n")}`
            : "";
        return {
          content: [{ type: "text", text: `${answer}${contextText}` }],
        };
      }

      case "create_video_notes": {
        const parsed = CreateVideoNotesArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments for create_video_notes: ${parsed.error}`);
        }
        let transcript = transcriptCache.get(parsed.data.youtubeUrl);
        if (!transcript) {
          transcript = await copyTranscript(parsed.data.youtubeUrl);
          if (transcript.startsWith("Error") || transcript.includes("not available")) {
            return {
              content: [{ type: "text", text: transcript }],
              isError: true,
            };
          }
          transcriptCache.set(parsed.data.youtubeUrl, transcript);
        }

        // Generate or use custom title
        const title = parsed.data.customTitle
          ? sanitizeFileName(parsed.data.customTitle)
          : sanitizeFileName(generateTitle(transcript));

        // Generate notes content
        const summary = generateSummary(transcript);
        const keypoints = extractKeypoints(transcript);

        // Select transcript excerpts (top 5 lines by word frequency)
        const lines = transcript.split("\n").filter((line) => line.trim());
        const wordFreq: Map<string, number> = new Map();
        lines.forEach((line) => {
          const words = line.toLowerCase().split(/\s+/);
          words.forEach((word) => {
            if (word.length > 3) {
              wordFreq.set(word, (wordFreq.get(word) || 0) + 1);
            }
          });
        });
        const scoredLines = lines.map((line) => {
          const words = line.toLowerCase().split(/\s+/);
          const score = words.reduce(
            (sum, word) => sum + (wordFreq.get(word) || 0),
            0
          );
          return { line, score };
        });
        const excerpts = scoredLines
          .sort((a, b) => b.score - a.score)
          .slice(0, 5)
          .map((item) => `- ${item.line}`);

        // Format notes
        const notesContent = `# ${title.replace(/_/g, " ")}\n\n` +
          `## Summary\n${summary}\n\n` +
          `## Key Points\n${keypoints}\n\n` +
          `## Transcript Excerpts\n${excerpts.join("\n")}`;

        // Create notes directory
        const notesDir = path.join(allowedDirectory, "notes");
        await fs.mkdir(notesDir, { recursive: true });

        // Save notes file
        const fileName = `${title}.txt`;
        const filePath = path.join(notesDir, fileName);
        const validPath = await validatePath(filePath);
        await fs.writeFile(validPath, notesContent, "utf-8");

        return {
          content: [
            {
              type: "text",
              text: `Notes saved to ${filePath}\n\n${notesContent}`,
            },
          ],
        };
      }

      case "find_in_video": {
        const parsed = FindInVideoArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments for find_in_video: ${parsed.error}`);
        }
        let transcript = transcriptCache.get(parsed.data.youtubeUrl);
        if (!transcript) {
          transcript = await copyTranscript(parsed.data.youtubeUrl);
          if (transcript.startsWith("Error") || transcript.includes("not available")) {
            return {
              content: [{ type: "text", text: transcript }],
              isError: true,
            };
          }
          transcriptCache.set(parsed.data.youtubeUrl, transcript);
        }
        const result = findInVideo(parsed.data.query, transcript);
        return {
          content: [{ type: "text", text: result }],
        };
      }

      case "list_youtube_functionalities": {
        const parsed = ListYouTubeFunctionalitiesArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments for list_youtube_functionalities: ${parsed.error}`);
        }
        const youtubeTools = [
          {
            name: "fetch_transcript",
            description:
              "Fetch the transcript of a YouTube video given its URL. The transcript is cached for subsequent operations.",
          },
          {
            name: "answer_question",
            description:
              "Answer a question based on the transcript of a YouTube video. Requires the video URL and the question.",
          },
          {
            name: "generate_summary",
            description:
              "Generate a concise summary of a YouTube video's transcript based on its URL.",
          },
          {
            name: "extract_keypoints",
            description:
              "Extract key points from a YouTube video's transcript based on its URL.",
          },
          {
            name: "chat_with_video",
            description:
              "Engage in a conversational chat about a YouTube video, maintaining context across messages.",
          },
          {
            name: "create_video_notes",
            description:
              "Create a text file with comprehensive notes for a YouTube video, including summary, key points, and transcript excerpts. " +
              "The file is saved in the 'notes' subdirectory with a generated or custom title.",
          },
          {
            name: "find_in_video",
            description:
              "Find where a specific phrase, sentence, or topic is discussed in a YouTube video's transcript. Returns timestamps and matching lines.",
          },
        ];
        const formattedList = youtubeTools
          .map((tool, index) => `${index + 1}. **${tool.name}**: ${tool.description}`)
          .join("\n");
        return {
          content: [
            {
              type: "text",
              text: `YouTube-Related Functionalities:\n${formattedList}`,
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: "text", text: `Error: ${errorMessage}` }],
      isError: true,
    };
  }
});

// Start server
async function runServer() {
  await validateDirectory();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("YouTube Transcript Agent Server running on stdio");
  console.error("Allowed directory:", allowedDirectory);
}

runServer().catch((error) => {
  console.error("Fatal error running server:", error);
  process.exit(1);
});