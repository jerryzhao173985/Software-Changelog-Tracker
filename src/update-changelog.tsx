import { useState, useEffect } from "react";
import {
  Action,
  ActionPanel,
  Detail,
  Toast,
  showToast,
  getPreferenceValues,
  getLocalStorageItem
} from "@raycast/api";
import { updateChangelog } from "./utils/changelog";
import { getToolInfo } from "./utils/toolMapping";

interface Preferences {
  apiKey: string;
  toolName?: string;
  changelogUrl?: string;
}

export default function UpdateChangelog() {
  const [isLoading, setIsLoading] = useState(true);
  const [output, setOutput] = useState("Starting changelog update...");
  const [success, setSuccess] = useState(false);
  const [entriesCount, setEntriesCount] = useState(0);
  const [toolInfo, setToolInfo] = useState({ name: "Changelog", url: "" });
  
  const preferences = getPreferenceValues<Preferences>();
  
  // Load tool info from local storage first
  useEffect(() => {
    async function loadToolInfo() {
      try {
        const storedToolName = await getLocalStorageItem("toolName") as string | undefined;
        const storedChangelogUrl = await getLocalStorageItem("changelogUrl") as string | undefined;
        
        // Get tool info from local storage values or fall back to preferences
        const currentToolInfo = getToolInfo(
          storedToolName || preferences.toolName,
          storedChangelogUrl || preferences.changelogUrl
        );
        
        setToolInfo(currentToolInfo);
      } catch (error) {
        console.error("Error loading tool info:", error);
        // Fall back to preference values if localStorage fails
        setToolInfo(getToolInfo(preferences.toolName, preferences.changelogUrl));
      }
    }
    
    loadToolInfo();
  }, []);
  
  useEffect(() => {
    // Only start fetching after toolInfo is loaded
    if (toolInfo.url) {
      fetchChangelog();
    }
  }, [toolInfo]);
  
  async function fetchChangelog() {
    try {
      setOutput((prev) => prev + `\nConnecting to ${toolInfo.url}...`);
      
      const data = await updateChangelog(preferences.apiKey, toolInfo.name, toolInfo.url);
      
      setOutput((prev) => 
        prev + 
        "\nConnection successful!" + 
        "\nExtracting changelog data..." +
        `\nFound ${data.length} changelog entries.` +
        "\nChangelog database updated successfully!"
      );
      
      setEntriesCount(data.length);
      setSuccess(true);
      
      await showToast({
        style: Toast.Style.Success,
        title: `${toolInfo.name} changelog updated`,
        message: `Found ${data.length} entries`,
      });
    } catch (error) {
      setOutput((prev) => prev + `\nError: ${error}`);
      setSuccess(false);
      
      await showToast({
        style: Toast.Style.Failure,
        title: `Failed to update ${toolInfo.name} changelog`,
        message: String(error),
      });
    } finally {
      setIsLoading(false);
    }
  }
  
  // Format the markdown with the output log
  const markdown = `# ${toolInfo.name} Changelog Update ${success ? "✅" : ""}
  
\`\`\`
${output}
\`\`\`

${success ? `Successfully retrieved ${entriesCount} changelog entries.` : ""}
`;
  
  return (
    <Detail
      markdown={markdown}
      isLoading={isLoading}
      actions={
        <ActionPanel>
          <Action.CopyToClipboard
            title="Copy Log"
            content={output}
            shortcut={{ modifiers: ["cmd"], key: "c" }}
          />
          <Action
            title="Retry Update"
            shortcut={{ modifiers: ["cmd"], key: "r" }}
            onAction={() => {
              setIsLoading(true);
              setOutput("Restarting changelog update...");
              setSuccess(false);
              setEntriesCount(0);
              fetchChangelog();
            }}
          />
        </ActionPanel>
      }
    />
  );
} 