/**
 * Mapping between tool names and their changelog URLs
 */
interface ToolInfo {
  name: string;
  url: string;
}

// Default tool information
export const DEFAULT_TOOL: ToolInfo = {
  name: "Cursor",
  url: "https://cursor.com/changelog"
};

// Dictionary of tool names to their changelog URLs
export const toolInfo: Record<string, { name: string; url: string }> = {
  "Cursor": { name: "Cursor", url: "https://cursor.com/changelog" },
  "GitHub": { name: "GitHub", url: "https://github.blog/changelog" },
  "GitLab": { name: "GitLab", url: "https://about.gitlab.com/releases" },
  "Visual Studio Code": { name: "Visual Studio Code", url: "https://code.visualstudio.com/updates" },
  "Node.js": { name: "Node.js", url: "https://nodejs.org/en/blog/release" },
  "Python": { name: "Python", url: "https://docs.python.org/3/whatsnew/" },
  "Docker": { name: "Docker", url: "https://docs.docker.com/compose/releases/release-notes" },
  "Kubernetes": { name: "Kubernetes", url: "https://github.com/kubernetes/kubernetes/releases" },
  "React": { name: "React", url: "https://github.com/facebook/react/releases" },
  "Angular": { name: "Angular", url: "https://github.com/angular/angular/releases" },
  "Vue.js": { name: "Vue.js", url: "https://github.com/vuejs/vue/releases" },
  "Electron": { name: "Electron", url: "https://github.com/electron/electron/releases" },
  "PostgreSQL": { name: "PostgreSQL", url: "https://www.postgresql.org/docs/release/" },
  "MySQL": { name: "MySQL", url: "https://dev.mysql.com/doc/relnotes/" },
  "Jira": { name: "Jira", url: "https://confluence.atlassian.com/jira" },
  "Beamer": { name: "Beamer", url: "https://www.beamer.com/changelog" },
  "AnnounceKit": { name: "AnnounceKit", url: "https://announcekit.app/changelog" },
  "Changelogfy": { name: "Changelogfy", url: "https://changelogfy.com/changelog" },
  "Canny": { name: "Canny", url: "https://canny.io/changelog" },
  "LaunchNotes": { name: "LaunchNotes", url: "https://www.launchnotes.com/blog/release-notes-examples" },
  "Stripe": { name: "Stripe", url: "https://stripe.com/blog/changelog" },
  "Twilio": { name: "Twilio", url: "https://www.twilio.com/changelog" },
  "Notion": { name: "Notion", url: "https://www.notion.so/releases" },
  "Slack": { name: "Slack", url: "https://slack.com/release-notes" },
  "Airtable": { name: "Airtable", url: "https://airtable.com/whatsnew" },
  
  // Adding new tools from the list
  "Visual Studio": { name: "Visual Studio", url: "https://learn.microsoft.com/en-us/visualstudio/releases/2022/release-notes" },
  "IntelliJ IDEA": { name: "IntelliJ IDEA", url: "https://www.jetbrains.com/idea/whatsnew/" },
  "PyCharm": { name: "PyCharm", url: "https://www.jetbrains.com/pycharm/whatsnew/" },
  "WebStorm": { name: "WebStorm", url: "https://www.jetbrains.com/webstorm/whatsnew/" },
  "Sublime Text": { name: "Sublime Text", url: "https://www.sublimetext.com/dev" },
  "Neovim": { name: "Neovim", url: "https://neovim.io/doc/user/news.html" },
  "Vim": { name: "Vim", url: "https://github.com/vim/vim/tags" },
  "Eclipse IDE": { name: "Eclipse IDE", url: "https://eclipse.dev/eclipse/news/" },
  "Git": { name: "Git", url: "https://github.com/git/git/releases" },
  "Bitbucket": { name: "Bitbucket", url: "https://support.atlassian.com/bitbucket-cloud/docs/release-notes/" }
};

// Export a simple mapping of tool names to URLs for use in UI components
export const TOOL_MAPPINGS: Record<string, string> = Object.entries(toolInfo).reduce(
  (acc, [name, data]) => {
    acc[name] = data.url;
    return acc;
  },
  {} as Record<string, string>
);

/**
 * Get a tool name from a URL by looking through the mappings
 * @param url - URL to search for
 * @returns Tool name if found, undefined otherwise
 */
const getToolNameFromUrl = (url: string): string | undefined => {
  for (const [name, data] of Object.entries(toolInfo)) {
    if (url.includes(data.url)) {
      return name;
    }
  }
  return undefined;
};

/**
 * Get tool information
 * @param toolName - Optional tool name from preferences
 * @param changelogUrl - Optional custom URL from preferences
 * @returns Tool information with name and URL
 */
export const getToolInfo = (toolName?: string, changelogUrl?: string): { name: string; url: string } => {
  // If custom URL is provided, it takes precedence
  if (changelogUrl) {
    const name = toolName || getToolNameFromUrl(changelogUrl) || "Custom Tool";
    return { name, url: changelogUrl };
  }
  
  // If only toolName is provided, look up the URL in mappings
  if (toolName) {
    const toolData = toolInfo[toolName];
    if (toolData) {
      return toolData;
    }
  }
  
  // Default to Cursor if no valid tool or URL provided
  return toolInfo["Cursor"];
};

/**
 * Get the data directory name for a given tool
 * @param toolName - The name of the tool
 * @returns Sanitized directory name based on the tool name
 */
export function getDataDirName(toolName: string): string {
  // Convert to lowercase and replace spaces with dashes
  return toolName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
} 