import { useState, useEffect } from "react";
import {
  Action,
  ActionPanel,
  Detail,
  Form,
  Toast,
  showToast,
  getPreferenceValues,
  getLocalStorageItem,
  useNavigation,
  Icon
} from "@raycast/api";
import { updateChangelog } from "./utils/changelog";
import { getToolInfo } from "./utils/toolMapping";

interface Preferences {
  apiKey: string;
  toolName?: string;
  changelogUrl?: string;
}

// Component to display the results after update (using Detail view)
function UpdateResultDetail({ toolName, outputLog, success, entriesCount }: { toolName: string, outputLog: string, success: boolean, entriesCount: number }) {
  const markdown = `# ${toolName} Changelog Update ${success ? "✅" : "❌"}
  
\`\`\`
${outputLog}
\`\`\`

${success ? `Successfully processed ${entriesCount} changelog entries.` : "Update failed. See log above for details."}
`;
  return (
    <Detail
      markdown={markdown}
      actions={
        <ActionPanel>
          <Action.CopyToClipboard
            title="Copy Log"
            content={outputLog}
            shortcut={{ modifiers: ["cmd"], key: "c" }}
          />
        </ActionPanel>
      }
    />
  );
}

export default function UpdateChangelogForm() {
  const [isLoading, setIsLoading] = useState(false);
  const [toolInfo, setToolInfo] = useState({ name: "Changelog", url: "" });
  const [extractionMethod, setExtractionMethod] = useState<string>("default");
  const { push } = useNavigation();
  
  const preferences = getPreferenceValues<Preferences>();
  
  // Load tool info on initial mount
  useEffect(() => {
    async function loadToolInfo() {
      let name = preferences.toolName;
      let url = preferences.changelogUrl;
      try {
        const storedToolName = await getLocalStorageItem("toolName") as string | undefined;
        const storedChangelogUrl = await getLocalStorageItem("changelogUrl") as string | undefined;
        name = storedToolName || name;
        url = storedChangelogUrl || url;
      } catch (error) {
        console.error("Error loading tool info from local storage:", error);
      }
      // Set tool info using possibly updated name/url
      setToolInfo(getToolInfo(name, url));
    }
    
    loadToolInfo();
  }, []);
  
  // Renamed and modified to handle form submission
  async function handleSubmit() {
    if (!toolInfo.url || !preferences.apiKey) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Missing Configuration",
        message: "Please ensure API Key and Tool/URL are set.",
      });
      return;
    }
    
    setIsLoading(true);
    let logOutput = `Starting changelog update for ${toolInfo.name} using ${extractionMethod === 'ai' ? 'AI' : 'Default'} Extraction...\n`;
    logOutput += `Connecting to ${toolInfo.url}...\n`;
    let finalSuccess = false;
    let finalEntriesCount = 0;

    await showToast({
      style: Toast.Style.Animated,
      title: `Updating ${toolInfo.name} Changelog...`,
    });

    try {
      const useAI = extractionMethod === 'ai';
      
      // Call updateChangelog with the selected method
      const data = await updateChangelog(preferences.apiKey, toolInfo.name, toolInfo.url, useAI);
      
      logOutput += "Connection successful!\n";
      logOutput += "Extracting changelog data...\n";
      logOutput += `Found ${data.length} changelog entries.\n`;
      logOutput += "Changelog database updated successfully!\n";
      
      finalEntriesCount = data.length;
      finalSuccess = true;
      
      await showToast({
        style: Toast.Style.Success,
        title: `${toolInfo.name} changelog updated`,
        message: `Found ${data.length} entries`,
      });
    } catch (error) {
      logOutput += `\nError: ${error}\n`;
      finalSuccess = false;
      
      await showToast({
        style: Toast.Style.Failure,
        title: `Failed to update ${toolInfo.name} changelog`,
        message: String(error),
      });
    } finally {
      setIsLoading(false);
      // Push the results Detail view
      push(<UpdateResultDetail 
              toolName={toolInfo.name} 
              outputLog={logOutput} 
              success={finalSuccess} 
              entriesCount={finalEntriesCount} 
            />);
    }
  }
  
  return (
    <Form
      isLoading={isLoading}
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Update Changelog"
            icon={Icon.Upload}
            onSubmit={handleSubmit}
          />
        </ActionPanel>
      }
    >
      <Form.Description text={`Update changelog for ${toolInfo.name} (${toolInfo.url})`} />
      <Form.Dropdown
        id="extractionMethod"
        title="Extraction Method"
        value={extractionMethod}
        onChange={setExtractionMethod}
      >
        <Form.Dropdown.Item value="default" title="Default Extraction" />
        <Form.Dropdown.Item value="ai" title="AI Extraction" />
      </Form.Dropdown>
      {/* You could add fields here to override toolName/changelogUrl if desired */}      
    </Form>
  );
} 