import { CopilotClient } from "@github/copilot-sdk";
import type { AiTerminalSuggestion } from "../shared/git.js";
import { CopilotStore } from "./copilotStore.js";
import { getLogger } from "./logger.js";

const logger = getLogger("CopilotService");

/**
 * Provides commit message generation through the Copilot CLI service.
 */
export class CopilotService {
  constructor(private readonly copilotStore: CopilotStore) {}

  /**
   * Generates a structured commit title and description for the staged diff.
   */
  async generateCommitMessage(stagedChanges: string): Promise<{ title: string; description: string }> {
    logger.debug({ length: stagedChanges.length }, "Starting commit message generation");

    if (!stagedChanges.trim()) {
      throw new Error("Aucun changement staged pour générer un message de commit.");
    }

    const enabled = this.copilotStore.getConfig("enabled");
    logger.debug({ enabled }, "Copilot enabled flag read");

    if (enabled !== "true") {
      throw new Error("La génération de message de commit via Copilot est désactivée.");
    }

    const rawCliUrl = this.copilotStore.getConfig("cli_url") || "localhost:4321";
    const cliUrl = rawCliUrl.replace(/^https?:\/\//, "");
    const model = this.copilotStore.getConfig("model") || "gpt-4.1";
    const systemPrompt = this.copilotStore.getConfig("system");

    const defaultSystemPrompt = `You are a helpful assistant that generates commit messages.

Format:
Title: type: brief description (under 50 characters)
Description: detailed explanation of the changes

Types: feat, fix, docs, style, refactor, test, chore

Answer with only the commit message in the specified format.`;

    const combinedSystemPrompt = systemPrompt
      ? `${defaultSystemPrompt}\n\nAdditional instructions:\n${systemPrompt.trim()}`
      : defaultSystemPrompt;

    const prompt = `Changes:\n${stagedChanges}\n\nGenerate the commit message now.`;

    logger.debug({ promptLength: prompt.length, cliUrl, model }, "Prepared Copilot request");

    const client = new CopilotClient({ cliUrl });

    try {
      const sessionOptions: {
        model?: string;
        systemMessage?: { content: string };
      } = {
        model,
        systemMessage: { content: combinedSystemPrompt }
      };

      if (systemPrompt) {
        logger.debug("Using system prompt overrides");
      }

      const session = await client.createSession(sessionOptions);
      const response = await session.sendAndWait({ prompt });
      const content = response?.data?.content?.trim() || "";

      logger.debug({ content }, "Copilot raw response received");

      const result = content || "Generated commit message";
      const { title, description } = this.parseCommitMessage(result);

      return { title, description };
    } catch (error) {
      logger.error({ error }, "Copilot request failed");
      const message = error instanceof Error ? error.message : "Unknown error";
      throw new Error(`Échec de l'appel Copilot : ${message}`);
    } finally {
      await client.stop();
    }
  }

  /**
   * Generates branch name suggestions based on working directory changes.
   */
  async generateBranchNameSuggestions(workingChanges: string): Promise<string[]> {
    logger.debug({ length: workingChanges.length }, "Starting branch name suggestion generation");

    if (!workingChanges.trim()) {
      throw new Error("Aucune modification détectée pour proposer un nom de branche.");
    }

    const enabled = this.copilotStore.getConfig("enabled");
    logger.debug({ enabled }, "Copilot enabled flag read");

    if (enabled !== "true") {
      throw new Error("La génération de noms de branche via Copilot est désactivée.");
    }

    const rawCliUrl = this.copilotStore.getConfig("cli_url") || "localhost:4321";
    const cliUrl = rawCliUrl.replace(/^https?:\/\//, "");
    const model = this.copilotStore.getConfig("model") || "gpt-4.1";
    const systemPrompt = this.copilotStore.getConfig("system");

    const defaultSystemPrompt = `You are a helpful assistant that proposes Git branch names.

Rules:
- Provide 5 suggestions.
- Format: <type>/<short-kebab-case>.
- Types: feat, fix, docs, chore, refactor, test.
- Lowercase only; no spaces; only letters, numbers, dash, and slash.
- Output only the list, one per line.`;

    const combinedSystemPrompt = systemPrompt
      ? `${defaultSystemPrompt}\n\nAdditional instructions:\n${systemPrompt.trim()}`
      : defaultSystemPrompt;

    const prompt = `Working directory changes:\n${workingChanges}\n\nGenerate the branch name suggestions now.`;

    logger.debug({ promptLength: prompt.length, cliUrl, model }, "Prepared Copilot request for branch names");

    const client = new CopilotClient({ cliUrl });

    try {
      const sessionOptions: {
        model?: string;
        systemMessage?: { content: string };
      } = {
        model,
        systemMessage: { content: combinedSystemPrompt }
      };

      if (systemPrompt) {
        logger.debug("Using system prompt overrides");
      }

      const session = await client.createSession(sessionOptions);
      const response = await session.sendAndWait({ prompt });
      const content = response?.data?.content?.trim() || "";

      logger.debug({ content }, "Copilot raw response received for branch names");

      const suggestions = this.parseBranchSuggestions(content);

      if (suggestions.length === 0) {
        return ["chore/working-changes"];
      }

      return suggestions;
    } catch (error) {
      logger.error({ error }, "Copilot request failed for branch names");
      const message = error instanceof Error ? error.message : "Unknown error";
      throw new Error(`Échec de l'appel Copilot : ${message}`);
    } finally {
      await client.stop();
    }
  }

  /**
   * Suggests a single Git command from natural language.
   */
  async suggestGitCommand(
    prompt: string,
    context: { repoPath: string | null; repoName: string | null; statusSummary: string | null; history: Array<{ command: string; exitCode: number | null; isGlobal: boolean; timestamp: number }> }
  ): Promise<AiTerminalSuggestion> {
    logger.debug({ promptLength: prompt.length }, "Starting git command suggestion");

    if (!prompt.trim()) {
      throw new Error("Veuillez fournir une instruction en langage naturel.");
    }

    const enabled = this.copilotStore.getConfig("enabled");
    logger.debug({ enabled }, "Copilot enabled flag read");

    if (enabled !== "true") {
      throw new Error("La génération de commandes Git via Copilot est désactivée.");
    }

    const rawCliUrl = this.copilotStore.getConfig("cli_url") || "localhost:4321";
    const cliUrl = rawCliUrl.replace(/^https?:\/\//, "");
    const model = this.copilotStore.getConfig("model") || "gpt-4.1";
    const systemPrompt = this.copilotStore.getConfig("system");

    const defaultSystemPrompt = `You translate natural language into ONE Git command.

Rules:
- Output JSON only.
- Keys: command, explanation.
- command must start with "git" and contain no shell chaining (no &&, ;, |).
- Use the simplest safe command.
- If the request is ambiguous, set command to "" and explain what you need.
`;

    const combinedSystemPrompt = systemPrompt
      ? `${defaultSystemPrompt}\nAdditional instructions:\n${systemPrompt.trim()}`
      : defaultSystemPrompt;

    const historyLines = context.history
      .slice(0, 10)
      .map((entry) => {
        const suffix = entry.exitCode === null ? "" : ` (exit ${entry.exitCode})`;
        return `- ${entry.command}${suffix}`;
      });

    const contextLines = [
      context.repoName && context.repoPath
        ? `Repository: ${context.repoName} (${context.repoPath})`
        : "Repository: none (no repository open)",
      context.statusSummary ? `Status summary:\n${context.statusSummary}` : null,
      historyLines.length > 0 ? `Recent command history:\n${historyLines.join("\n")}` : null
    ].filter(Boolean);

    const fullPrompt = `User request:\n${prompt.trim()}\n\n${contextLines.join("\n\n")}\n\nReturn the JSON now.`;

    logger.debug({ promptLength: fullPrompt.length, cliUrl, model }, "Prepared Copilot request for git command");

    const client = new CopilotClient({ cliUrl });

    try {
      const sessionOptions: {
        model?: string;
        systemMessage?: { content: string };
      } = {
        model,
        systemMessage: { content: combinedSystemPrompt }
      };

      const session = await client.createSession(sessionOptions);
      const response = await session.sendAndWait({ prompt: fullPrompt });
      const content = response?.data?.content?.trim() || "";

      logger.debug({ content }, "Copilot raw response received for git command");

      const parsed = this.parseGitCommandResponse(content);
      const command = this.normalizeGitCommand(parsed.command);

      if (!command) {
        throw new Error("Copilot n'a pas fourni de commande Git exploitable.");
      }

      const isGlobal = this.isGlobalCommand(command);
      const requiresRepo = this.requiresRepo(command, isGlobal);

      return {
        command,
        explanation: parsed.explanation || "",
        isGlobal,
        requiresRepo,
        warnings: []
      };
    } catch (error) {
      logger.error({ error }, "Copilot request failed for git command");
      const message = error instanceof Error ? error.message : "Unknown error";
      throw new Error(`Échec de l'appel Copilot : ${message}`);
    } finally {
      await client.stop();
    }
  }

  /**
   * Parses the Copilot response into a title/description pair.
   */
  private parseCommitMessage(result: string): { title: string; description: string } {
    const lines = result.split("\n").map((line) => line.trim());
    const titleIndex = lines.findIndex((line) => /^title\s*:/i.test(line));
    const descriptionIndex = lines.findIndex((line) => /^description\s*:/i.test(line));

    const titleLine = titleIndex >= 0 ? lines[titleIndex] : "";
    const title = titleLine
      ? titleLine.replace(/^title\s*:/i, "").trim()
      : "feat: generated commit";

    let description = "";
    if (descriptionIndex >= 0) {
      const firstLine = lines[descriptionIndex].replace(/^description\s*:/i, "").trim();
      const tailLines = lines
        .slice(descriptionIndex + 1)
        .filter((line) => line.length > 0);
      description = [firstLine, ...tailLines].filter((line) => line.length > 0).join("\n");
    } else if (titleIndex >= 0) {
      const otherLines = lines
        .filter((_, index) => index !== titleIndex)
        .filter((line) => line.length > 0);
      description = otherLines.join("\n");
    }

    if (!description.trim()) {
      description = title;
    }

    return { title, description };
  }

  /**
   * Parses Copilot response into a git command + explanation.
   */
  private parseGitCommandResponse(content: string): { command: string; explanation: string } {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]) as { command?: string; explanation?: string };
        if (parsed.command || parsed.explanation) {
          return {
            command: parsed.command ?? "",
            explanation: parsed.explanation ?? ""
          };
        }
      } catch {
        // Fall back to line parsing
      }
    }

    const line = content
      .split("\n")
      .map((value) => value.trim())
      .find((value) => value.toLowerCase().startsWith("git "));

    return { command: line ?? "", explanation: "" };
  }

  /**
   * Normalizes the git command string.
   */
  private normalizeGitCommand(value: string): string {
    let command = value.trim();
    command = command.replace(/^`+|`+$/g, "");
    const lower = command.toLowerCase();
    if (!lower.startsWith("git")) {
      const index = lower.indexOf("git ");
      if (index >= 0) {
        command = command.slice(index).trim();
      }
    }
    return command;
  }

  /**
   * Returns true when a command targets global configuration.
   */
  private isGlobalCommand(command: string): boolean {
    const lower = command.toLowerCase();
    return lower.includes("--global") || lower.includes("--system");
  }

  /**
   * Determines whether a command requires a repository.
   */
  private requiresRepo(command: string, isGlobal: boolean): boolean {
    if (isGlobal) {
      return false;
    }
    const args = this.splitArgs(command);
    const subcommand = args[1] ?? "";
    if (!subcommand) {
      return false;
    }
    const lower = subcommand.toLowerCase();
    const noRepo = new Set(["clone", "init", "config", "help", "version", "--version", "--help", "ls-remote"]);
    if (noRepo.has(lower) || lower.startsWith("-")) {
      return false;
    }
    return true;
  }

  /**
   * Splits a command string into arguments while preserving quoted text.
   */
  private splitArgs(input: string): string[] {
    const args: string[] = [];
    let current = "";
    let quote: '"' | "'" | null = null;
    let escape = false;

    for (const char of input) {
      if (escape) {
        current += char;
        escape = false;
        continue;
      }
      if (char === "\\") {
        escape = true;
        continue;
      }
      if (quote) {
        if (char === quote) {
          quote = null;
        } else {
          current += char;
        }
        continue;
      }
      if (char === '"' || char === "'") {
        quote = char;
        continue;
      }
      if (/\s/.test(char)) {
        if (current) {
          args.push(current);
          current = "";
        }
        continue;
      }
      current += char;
    }

    if (current) {
      args.push(current);
    }

    return args;
  }

  /**
   * Parses Copilot response into a list of branch name suggestions.
   */
  private parseBranchSuggestions(result: string): string[] {
    const rawLines = result
      .split("\n")
      .flatMap((line) => line.split(","))
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => line.replace(/^[-*•\d\.)\s]+/, ""))
      .map((line) => line.replace(/^['"`]|['"`]$/g, ""));

    const normalized = rawLines
      .map((line) => this.normalizeBranchName(line))
      .filter(Boolean);

    return Array.from(new Set(normalized)).slice(0, 5);
  }

  /**
   * Normalizes a branch name string to the expected format.
   */
  private normalizeBranchName(value: string): string {
    let cleaned = value.toLowerCase().trim();
    cleaned = cleaned.replace(/[^a-z0-9/-]+/g, "-");
    cleaned = cleaned.replace(/-+/g, "-");
      cleaned = cleaned.replace(/\/+/g, "/");
    cleaned = cleaned.replace(/^[-/]+|[-/]+$/g, "");

    if (!cleaned) {
      return "";
    }

    if (!cleaned.includes("/")) {
      cleaned = `chore/${cleaned}`;
    }

    return cleaned;
  }
}