import { useState, useEffect } from "react";
import {
  Action,
  ActionPanel,
  Detail,
  Toast,
  showToast,
  getPreferenceValues,
  Icon,
  Color,
} from "@raycast/api";
import { getLatestVersion, loadChangelog, updateChangelog } from "./utils/changelog";
import { getToolInfo } from "./utils/toolMapping";

interface Preferences {
  apiKey: string;
  toolName?: string;
  changelogUrl?: string;
}

export default function GetLatest() {
  const [isLoading, setIsLoading] = useState(true);
  const [latestVersion, setLatestVersion] = useState<{ version: string; description: string; detailLink?: string } | null>(null);
  const [needsUpdate, setNeedsUpdate] = useState(false);
  const [allVersions, setAllVersions] = useState<{ version: string; description: string; detailLink?: string }[]>([]);
  const [currentVersionIndex, setCurrentVersionIndex] = useState(0);
  
  const preferences = getPreferenceValues<Preferences>();
  const toolInfo = getToolInfo(preferences.toolName, preferences.changelogUrl);
  
  useEffect(() => {
    async function fetchLatest() {
      try {
        // Load all versions first
        const allEntries = await loadChangelog(preferences.toolName, preferences.changelogUrl);
        setAllVersions(allEntries);
        
        // Try to get the latest version from local data
        const latest = await getLatestVersion(preferences.toolName, preferences.changelogUrl);
        
        if (latest) {
          setLatestVersion(latest);
          setNeedsUpdate(false);
          
          // Find the index of the latest version in the array
          const index = allEntries.findIndex(entry => entry.version === latest.version);
          if (index !== -1) {
            setCurrentVersionIndex(index);
          }
        } else {
          // If no local data, flag that we need to update
          setNeedsUpdate(true);
          
          // Try to update the changelog and get the latest version
          await updateChangelog(preferences.apiKey, preferences.toolName, preferences.changelogUrl);
          const updatedAllEntries = await loadChangelog(preferences.toolName, preferences.changelogUrl);
          setAllVersions(updatedAllEntries);
          
          const updatedLatest = await getLatestVersion(preferences.toolName, preferences.changelogUrl);
          setLatestVersion(updatedLatest);
          
          // Set the index to the first entry (latest version)
          setCurrentVersionIndex(0);
        }
      } catch (error) {
        await showToast({
          style: Toast.Style.Failure,
          title: `Failed to get latest ${toolInfo.name} version`,
          message: String(error),
        });
      } finally {
        setIsLoading(false);
      }
    }
    
    fetchLatest();
  }, [preferences.apiKey, preferences.toolName, preferences.changelogUrl]);
  
  const refreshChangelog = async () => {
    setIsLoading(true);
    
    try {
      const toast = await showToast({
        style: Toast.Style.Animated,
        title: `Updating ${toolInfo.name} changelog`,
      });
      
      await updateChangelog(preferences.apiKey, preferences.toolName, preferences.changelogUrl);
      const updatedAllEntries = await loadChangelog(preferences.toolName, preferences.changelogUrl);
      setAllVersions(updatedAllEntries);
      
      const updatedLatest = await getLatestVersion(preferences.toolName, preferences.changelogUrl);
      setLatestVersion(updatedLatest);
      
      // Reset to show the latest version
      setCurrentVersionIndex(0);
      
      toast.style = Toast.Style.Success;
      toast.title = `${toolInfo.name} changelog updated`;
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
  
  // Navigation between versions
  const goToNextVersion = () => {
    if (currentVersionIndex > 0) {
      setCurrentVersionIndex(currentVersionIndex - 1);
      setLatestVersion(allVersions[currentVersionIndex - 1]);
    }
  };
  
  const goToPreviousVersion = () => {
    if (currentVersionIndex < allVersions.length - 1) {
      setCurrentVersionIndex(currentVersionIndex + 1);
      setLatestVersion(allVersions[currentVersionIndex + 1]);
    }
  };
  
  // Determine if next/previous navigation is possible
  const hasNext = currentVersionIndex > 0;
  const hasPrevious = currentVersionIndex < allVersions.length - 1;
  
  // Get the current version to display (from navigation)
  const currentVersion = allVersions[currentVersionIndex];
  const displayVersion = latestVersion || currentVersion;
  
  // Format the markdown for the detail view
  let markdown;
  if (displayVersion) {
    markdown = `# ${toolInfo.name} Update: ${displayVersion.version}

## What's New:

${displayVersion.description}

${displayVersion.detailLink ? `\n[View Full Details](${displayVersion.detailLink})\n` : ''}
---

${hasNext ? '**Newer Version →**' : ''} ${currentVersionIndex === 0 ? '**Latest Version**' : ''} ${hasPrevious ? '**← Older Version**' : ''}

*Last updated: ${new Date().toLocaleString()}*
`;
  } else if (needsUpdate) {
    markdown = `# No Changelog Data Available

It seems like this is your first time using the extension or the changelog data is missing.

Please use the "Update Changelog" action to download the latest changelog information.
`;
  } else {
    markdown = `# Unable to Retrieve Latest Version

There was a problem retrieving the latest ${toolInfo.name} version information.

Please try the "Refresh" action or check your internet connection.
`;
  }
  
  // Get the base URL for the tool (remove /changelog or similar from the end)
  const getBaseUrl = (url: string): string => {
    // Check if the URL already has a domain name
    if (/^https?:\/\/[^/]+\/?$/.test(url)) {
      return url;
    }
    
    // Extract the domain part
    const match = url.match(/^(https?:\/\/[^/]+)/);
    if (match && match[1]) {
      return match[1];
    }
    
    return url;
  };
  
  const baseUrl = getBaseUrl(toolInfo.url);
  
  return (
    <Detail
      markdown={markdown}
      isLoading={isLoading}
      actions={
        <ActionPanel>
          {hasNext && (
            <Action
              title="Next (Newer) Version"
              icon={Icon.ArrowRight}
              shortcut={{ modifiers: ["cmd"], key: "arrowRight" }}
              onAction={goToNextVersion}
            />
          )}
          {hasPrevious && (
            <Action
              title="Previous (Older) Version" 
              icon={Icon.ArrowLeft}
              shortcut={{ modifiers: ["cmd"], key: "arrowLeft" }}
              onAction={goToPreviousVersion}
            />
          )}
          <Action
            title="Refresh Changelog"
            icon={Icon.Download}
            shortcut={{ modifiers: ["cmd"], key: "r" }}
            onAction={refreshChangelog}
          />
          {displayVersion?.detailLink && (
            <Action.OpenInBrowser
              title="Open Release Notes"
              url={displayVersion.detailLink}
              shortcut={{ modifiers: ["cmd"], key: "o" }}
            />
          )}
          <Action.OpenInBrowser
            title="Visit Website"
            url={baseUrl}
            shortcut={{ modifiers: ["cmd", "shift"], key: "o" }}
          />
        </ActionPanel>
      }
      metadata={
        displayVersion ? (
          <Detail.Metadata>
            <Detail.Metadata.Label title="Version" text={displayVersion.version} />
            <Detail.Metadata.TagList title="Status">
              <Detail.Metadata.TagList.Item 
                text={currentVersionIndex === 0 ? "Latest" : `${currentVersionIndex + 1} of ${allVersions.length}`} 
                color={currentVersionIndex === 0 ? Color.Green : Color.Orange} 
              />
            </Detail.Metadata.TagList>
            <Detail.Metadata.Separator />
            <Detail.Metadata.Link
              title={`${toolInfo.name} Website`}
              target={baseUrl}
              text={`Visit ${toolInfo.name}`}
            />
            <Detail.Metadata.Link
              title="Full Changelog"
              target={toolInfo.url}
              text="View Online"
            />
            {displayVersion.detailLink && (
              <Detail.Metadata.Link
                title="Detailed Release Notes"
                target={displayVersion.detailLink}
                text="View Details"
              />
            )}
          </Detail.Metadata>
        ) : undefined
      }
    />
  );
} 