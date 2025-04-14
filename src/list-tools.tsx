import { useState } from "react";
import {
  Action,
  ActionPanel,
  List,
  Icon,
  useNavigation,
  Clipboard,
  showHUD,
} from "@raycast/api";
import { TOOL_MAPPINGS } from "./utils/toolMapping";

export default function ListTools() {
  const [searchText, setSearchText] = useState("");
  const { push } = useNavigation();
  
  const toolEntries = Object.entries(TOOL_MAPPINGS).map(([name, url]) => ({ name, url }));
  
  const filteredTools = toolEntries.filter(
    (tool) =>
      tool.name.toLowerCase().includes(searchText.toLowerCase()) ||
      tool.url.toLowerCase().includes(searchText.toLowerCase())
  );
  
  return (
    <List
      searchBarPlaceholder="Search for tools by name or URL"
      onSearchTextChange={setSearchText}
      throttle
    >
      <List.Section title="Supported Tools" subtitle={`${toolEntries.length} tools available`}>
        {filteredTools.map((tool) => (
          <List.Item
            key={tool.name}
            title={tool.name}
            subtitle={tool.url}
            icon={Icon.Code}
            accessories={[{ text: "Copy URL", icon: Icon.Clipboard }]}
            actions={
              <ActionPanel>
                <Action.OpenInBrowser
                  title="Open Changelog"
                  url={tool.url}
                  shortcut={{ modifiers: ["cmd"], key: "o" }}
                />
                <Action
                  title="Copy URL"
                  icon={Icon.Clipboard}
                  shortcut={{ modifiers: ["cmd"], key: "c" }}
                  onAction={async () => {
                    await Clipboard.copy(tool.url);
                    await showHUD(`Copied ${tool.name} changelog URL`);
                  }}
                />
                <Action
                  title="Change to This Tool"
                  icon={Icon.Switch}
                  shortcut={{ modifiers: ["cmd"], key: "s" }}
                  onAction={() => {
                    push(<ChangeTool initialTool={tool.name} initialUrl={tool.url} />);
                  }}
                />
              </ActionPanel>
            }
          />
        ))}
      </List.Section>
    </List>
  );
}

// Helper component to switch to a specific tool
function ChangeTool({ initialTool, initialUrl }: { initialTool: string; initialUrl: string }) {
  const [isLoading, setIsLoading] = useState(false);
  
  return (
    <ChangeToolForm 
      initialTool={initialTool} 
      initialUrl={initialUrl} 
      isLoading={isLoading} 
      setIsLoading={setIsLoading} 
    />
  );
}

// Import the ChangeTool component directly to avoid circular imports
import { useState as useImportedState, useEffect } from "react";
import {
  Form,
  Toast,
  showToast,
  getPreferenceValues,
  setLocalStorageItem,
} from "@raycast/api";
import { getToolInfo } from "./utils/toolMapping";

interface Preferences {
  apiKey: string;
  toolName?: string;
  changelogUrl?: string;
}

function ChangeToolForm({ 
  initialTool, 
  initialUrl, 
  isLoading, 
  setIsLoading 
}: { 
  initialTool: string; 
  initialUrl: string; 
  isLoading: boolean; 
  setIsLoading: (value: boolean) => void;
}) {
  const [toolName, setToolName] = useImportedState<string>(initialTool);
  const [changelogUrl, setChangelogUrl] = useImportedState<string>(initialUrl);
  const preferences = getPreferenceValues<Preferences>();
  const { pop } = useNavigation();
  
  // Handle form submission
  const handleSubmit = async (values: { toolName: string; changelogUrl: string }) => {
    try {
      setIsLoading(true);
      
      // Save to local storage
      await setLocalStorageItem("toolName", values.toolName);
      await setLocalStorageItem("changelogUrl", values.changelogUrl);
      
      const toolInfo = getToolInfo(values.toolName, values.changelogUrl);
      
      await showToast({
        style: Toast.Style.Success,
        title: "Tool settings saved",
        message: `Now tracking ${toolInfo.name} changelog`,
      });
      
      pop();
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to save settings",
        message: String(error),
      });
      setIsLoading(false);
    }
  };
  
  return (
    <Form
      isLoading={isLoading}
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Save Settings"
            onSubmit={handleSubmit}
          />
        </ActionPanel>
      }
    >
      <Form.TextField
        id="toolName"
        title="Tool Name"
        placeholder="Enter tool name"
        value={toolName}
        onChange={setToolName}
        info="The name of the tool to track"
      />
      
      <Form.TextField
        id="changelogUrl"
        title="Changelog URL"
        placeholder="Enter the changelog URL"
        value={changelogUrl}
        onChange={setChangelogUrl}
        info="URL of the changelog page"
      />
      
      <Form.Description
        title="Confirm Change"
        text={`You are about to change to tracking the changelog for ${toolName}.`}
      />
    </Form>
  );
} 