import type { Plugin } from "@opencode/plugin";

export const TOKEN_ENV = "COPILOT_CREDITS_TOKEN";

/**
 * Prefers the GitHub OAuth token OpenCode already stores for the github-copilot
 * integration, falling back to COPILOT_CREDITS_TOKEN.
 */
export async function resolveToken(
	integration: Plugin.Context["integration"],
): Promise<string | undefined> {
	try {
		const connection = await integration.connection.active("github-copilot");
		const credential = connection
			? await integration.connection.resolve(connection)
			: undefined;
		const token =
			credential?.type === "oauth"
				? credential.refresh
				: credential?.type === "key"
					? credential.key
					: undefined;
		if (token) return token;
	} catch {
		// Fall through to the environment variable.
	}
	return process.env[TOKEN_ENV] || undefined;
}
