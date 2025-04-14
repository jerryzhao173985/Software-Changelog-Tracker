import {
  ActionPanel,
  Action,
  List,
  Detail,
  Toast,
  showToast,
  Icon,
  getPreferenceValues,
} from "@raycast/api";
import { useState, useEffect } from "react";
import { loadChangelog, updateChangelog } from "./utils/changelog";
import { getToolInfo } from "./utils/toolMapping";

interface Preferences {
  apiKey: string;
  toolName?: string;
  changelogUrl?: string;
}

export default function ViewChangelog() {
  const [entries, setEntries] = useState<{ version: string; description: string; detailLink?: string }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchText, setSearchText] = useState("");
  
  const preferences = getPreferenceValues<Preferences>();
  const toolInfo = getToolInfo(preferences.toolName, preferences.changelogUrl);
  
  useEffect(() => {
    async function fetchChangelog() {
      try {
        const data = await loadChangelog(preferences.toolName, preferences.changelogUrl);
        console.log("Loaded entries order:", data.map(entry => entry.version).join(", "));
        setEntries(data);
      } catch (error) {
        await showToast({
          style: Toast.Style.Failure,
          title: "Failed to load changelog",
          message: String(error),
        });
      } finally {
        setIsLoading(false);
      }
    }
    
    fetchChangelog();
  }, [preferences.toolName, preferences.changelogUrl]);
  
  const filteredEntries = entries.filter(
    (entry) =>
      entry.version.toLowerCase().includes(searchText.toLowerCase()) ||
      entry.description.toLowerCase().includes(searchText.toLowerCase())
  );
  
  const refreshChangelog = async () => {
    setIsLoading(true);
    
    try {
      const toast = await showToast({
        style: Toast.Style.Animated,
        title: `Updating ${toolInfo.name} changelog`,
      });
      
      const data = await updateChangelog(preferences.apiKey, preferences.toolName, preferences.changelogUrl);
      console.log("Updated entries order:", data.map(entry => entry.version).join(", "));
      setEntries(data);
      
      toast.style = Toast.Style.Success;
      toast.title = `${toolInfo.name} changelog updated`;
      toast.message = `Found ${data.length} entries`;
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: `Failed to update ${toolInfo.name} changelog`,
        message: String(error),
      });
    } finally {
      setIsLoading(false);
    }
  };
  
  return (
    <List
      isLoading={isLoading}
      searchBarPlaceholder="Search by version or description"
      onSearchTextChange={setSearchText}
      throttle
    >
      {filteredEntries.length === 0 ? (
        <List.EmptyView
          icon={Icon.Minus}
          title="No changelog entries found"
          description={
            entries.length === 0
              ? `Try updating the ${toolInfo.name} changelog database with the 'Update Changelog' command.`
              : "Try a different search term."
          }
        />
      ) : (
        filteredEntries.map((entry) => (
          <List.Item
            key={entry.version}
            title={entry.version}
            subtitle={entry.description.length > 60 ? `${entry.description.substring(0, 60)}...` : entry.description}
            actions={
              <ActionPanel>
                <Action.Push
                  title="View Details"
                  icon={Icon.Eye}
                  target={<ChangelogDetail version={entry.version} description={entry.description} detailLink={entry.detailLink} toolName={toolInfo.name} />}
                />
                <Action
                  title="Update Changelog"
                  icon={Icon.Download}
                  onAction={refreshChangelog}
                  shortcut={{ modifiers: ["cmd"], key: "r" }}
                />
              </ActionPanel>
            }
          />
        ))
      )}
    </List>
  );
}

function ChangelogDetail({ version, description, detailLink, toolName }: { version: string; description: string; detailLink?: string; toolName: string }) {
  // Format the markdown for the Detail view
  const markdown = `# ${toolName} ${version}\n\n${description}${detailLink ? `\n\n[View Full Details](${detailLink})` : ''}`;
  
  return (
    <Detail
      markdown={markdown}
      actions={
        <ActionPanel>
          <Action.CopyToClipboard
            title="Copy Version"
            content={version}
            shortcut={{ modifiers: ["cmd"], key: "c" }}
          />
          <Action.CopyToClipboard
            title="Copy Description"
            content={description}
            shortcut={{ modifiers: ["cmd", "shift"], key: "c" }}
          />
          {detailLink && (
            <Action.OpenInBrowser
              title="Open Detailed Changelog"
              url={detailLink}
              shortcut={{ modifiers: ["cmd"], key: "o" }}
            />
          )}
        </ActionPanel>
      }
    />
  );
} 