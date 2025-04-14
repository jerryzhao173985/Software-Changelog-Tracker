import { useState, useEffect } from "react";
import {
  Action,
  ActionPanel,
  Form,
  Toast,
  showToast,
  getPreferenceValues,
  useNavigation,
  getLocalStorageItem,
  setLocalStorageItem,
} from "@raycast/api";
import { TOOL_MAPPINGS, getToolInfo } from "./utils/toolMapping";

interface Preferences {
  apiKey: string;
  toolName?: string;
  changelogUrl?: string;
}

export default function ChangeTool() {
  const [isLoading, setIsLoading] = useState(true);
  const [toolName, setToolName] = useState<string>("");
  const [changelogUrl, setChangelogUrl] = useState<string>("");
  const [availableTools, setAvailableTools] = useState<{ name: string; value: string }[]>([]);
  
  const preferences = getPreferenceValues<Preferences>();
  const { pop } = useNavigation();
  
  // Load current settings on mount
  useEffect(() => {
    async function loadSettings() {
      try {
        const currentTool = preferences.toolName || "";
        const currentUrl = preferences.changelogUrl || "";
        
        setToolName(currentTool);
        setChangelogUrl(currentUrl);
        
        // Create dropdown items from available tools
        const toolOptions = Object.keys(TOOL_MAPPINGS).map((name) => ({ 
          name, 
          value: name 
        }));
        
        setAvailableTools(toolOptions);
      } catch (error) {
        console.error("Error loading settings:", error);
      } finally {
        setIsLoading(false);
      }
    }
    
    loadSettings();
  }, []);
  
  // Handle selected tool from dropdown
  const handleToolSelect = (value: string) => {
    setToolName(value);
    
    // If a known tool is selected, automatically set the URL
    if (value && TOOL_MAPPINGS[value]) {
      setChangelogUrl(TOOL_MAPPINGS[value]);
    }
  };
  
  // Save settings
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
      <Form.Dropdown
        id="toolName"
        title="Tool Name"
        placeholder="Select a tool or enter custom name"
        value={toolName}
        onChange={handleToolSelect}
      >
        <Form.Dropdown.Item value="" title="Custom Tool" />
        {availableTools.map((tool) => (
          <Form.Dropdown.Item
            key={tool.value}
            value={tool.value}
            title={tool.name}
          />
        ))}
      </Form.Dropdown>
      
      <Form.TextField
        id="customToolName"
        title="Custom Tool Name"
        placeholder="Enter a custom tool name"
        value={toolName}
        onChange={setToolName}
        info="Required if not selecting from dropdown"
      />
      
      <Form.TextField
        id="changelogUrl"
        title="Changelog URL"
        placeholder="Enter the changelog URL"
        value={changelogUrl}
        onChange={setChangelogUrl}
        info="URL will be auto-filled if selecting a known tool"
      />
      
      <Form.Description
        title="Instructions"
        text="Select a tool from the dropdown or enter a custom tool name and changelog URL. If you select a known tool, the URL will be automatically filled in."
      />
    </Form>
  );
} 