import { OllamaStore } from "./ollamaStore.js";

export class OllamaService {
  constructor(private readonly ollamaStore: OllamaStore) {}

  async generateCommitMessage(stagedChanges: string): Promise<{ title: string; description: string }> {
    console.log('[OllamaService] Starting commit message generation');
    console.log('[OllamaService] Staged changes length:', stagedChanges.length);

    if (!stagedChanges.trim()) {
      throw new Error("Aucun changement staged pour générer un message de commit.");
    }

    const enabled = this.ollamaStore.getConfig("enabled");
    console.log('[OllamaService] Ollama enabled:', enabled);

    if (enabled !== "true") {
      throw new Error("La génération de message de commit via Ollama est désactivée.");
    }

    const url = this.ollamaStore.getConfig("url") || "http://localhost:11434";
    const model = this.ollamaStore.getConfig("model") || "llama2";

    const prompt = `You are a helpful assistant that generates commit messages. Generate a commit message with a title and description for the following changes.

Format:
Title: type: brief description (under 50 characters)
Description: detailed explanation of the changes

Types: feat, fix, docs, style, refactor, test, chore

Changes:
${stagedChanges}

Answer with only the commit message in the specified format:`;

    console.log('[OllamaService] Generated prompt length:', prompt.length);

    try {
      const systemPrompt = this.ollamaStore.getConfig("system");
      const body: any = {
        model,
        prompt,
        stream: false
      };
      if (systemPrompt) {
        body.system = systemPrompt;
        console.log('[OllamaService] Using system prompt');
      }

      console.log('[OllamaService] Payload:', JSON.stringify(body, null, 2));

      console.log('[OllamaService] Sending request to:', `${url}/api/generate`);

      const response = await fetch(`${url}/api/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
      });

      console.log('[OllamaService] Response status:', response.status, response.statusText);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[OllamaService] API error response:', errorText);
        throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
      }

      const data = (await response.json()) as { response?: string; thinking?: string };
      console.log('[OllamaService] API response data:', data);

      const result = data.response?.trim() || "Generated commit message";
      console.log('[OllamaService] Final result:', result);

      // Parse the result into title and description
      const lines = result.split('\n');
      const titleLine = lines.find(line => line.startsWith('Title:'));
      const descriptionLine = lines.find(line => line.startsWith('Description:'));

      const title = titleLine ? titleLine.replace('Title:', '').trim() : 'feat: generated commit';
      const description = descriptionLine ? descriptionLine.replace('Description:', '').trim() : result;

      return { title, description };
    } catch (error) {
      console.error("[OllamaService] Error:", error);
      const message = error instanceof Error ? error.message : "Unknown error";
      throw new Error(`Échec de l'appel Ollama : ${message}`);
    }
  }
}
