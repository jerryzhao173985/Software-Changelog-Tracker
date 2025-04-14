import { existsSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import FirecrawlApp from "@mendable/firecrawl-js";
import { getToolInfo, getDataDirName } from "./toolMapping";
import { getLocalStorageItem } from "@raycast/api";

/**
 * Enhanced changelog scraping and extraction
 * 
 * Improvements:
 * - Tool-specific scraping configurations for better targeting content
 * - Enhanced HTML to markdown conversion with improved formatting preservation
 * - Pagination detection and handling to capture more content
 * - Fallback mechanisms for JavaScript-heavy pages
 * - Better error handling and recovery
 */

interface ChangelogEntry {
  version: string;
  description: string;
  detailLink?: string;
}

// Custom scraping configurations for specific tools
const toolScrapingConfigs: Record<string, {
  contentSelector?: string;
  excludeTags?: string[];
  includeSelectors?: string[];
  waitFor?: number;
}> = {
  "GitHub": {
    contentSelector: ".markdown-body",
    excludeTags: ["header", "footer", "nav"],
    waitFor: 1000
  },
  "Cursor": {
    contentSelector: "main, .markdown-body, article",
    excludeTags: ["header", "footer", "nav"],
    waitFor: 2000
  },
  "Visual Studio Code": {
    contentSelector: ".body, main, .changelog",
    excludeTags: ["header", "nav", "footer", "script", "style"],
    waitFor: 2000
  },
  "GitLab": {
    contentSelector: ".release-block, .release",
    excludeTags: ["header", "footer", "nav"],
    waitFor: 2000
  },
  "React": {
    contentSelector: ".markdown-body, .releases",
    excludeTags: ["header", "footer", "nav"],
    waitFor: 1000
  },
  "Angular": {
    contentSelector: ".markdown-body, .releases",
    excludeTags: ["header", "footer", "nav"],
    waitFor: 1000
  },
  "Vue.js": {
    contentSelector: ".markdown-body, .releases",
    excludeTags: ["header", "footer", "nav"],
    waitFor: 1000
  },
  "Electron": {
    contentSelector: ".markdown-body, .releases", 
    excludeTags: ["header", "footer", "nav"],
    waitFor: 1000
  },
  "Node.js": {
    contentSelector: ".release-content, .blog-content, article",
    excludeTags: ["header", "footer", "nav"],
    waitFor: 1500
  },
  "Docker": {
    contentSelector: ".docs-content, main, article",
    excludeTags: ["header", "footer", "nav"],
    waitFor: 2000
  },
  "Kubernetes": {
    contentSelector: ".markdown-body, .releases",
    excludeTags: ["header", "footer", "nav"],
    waitFor: 1000
  }
};

// Function to get scraping config for a tool
const getScrapingConfig = (toolName: string) => {
  return toolScrapingConfigs[toolName] || {
    contentSelector: "main, article, .content, .container", // Default selectors
    excludeTags: ["header", "footer", "nav", "script", "style"],
    waitFor: 2000
  };
};

// Get tool info from local storage or preferences
const getToolData = async (toolName?: string, changelogUrl?: string) => {
  // Check local storage first
  try {
    const storedToolName = await getLocalStorageItem("toolName") as string | undefined;
    const storedChangelogUrl = await getLocalStorageItem("changelogUrl") as string | undefined;
    
    // If we have values in local storage, use those instead of the provided values
    if (storedToolName || storedChangelogUrl) {
      toolName = storedToolName || toolName;
      changelogUrl = storedChangelogUrl || changelogUrl;
      console.log(`DEBUG: Using stored tool data - Name: ${toolName}, URL: ${changelogUrl}`);
    } else {
      console.log(`DEBUG: Using provided tool data - Name: ${toolName}, URL: ${changelogUrl}`);
    }
  } catch (error) {
    // If we can't access local storage, just use the provided values
    console.error("Error getting tool data from local storage:", error);
  }
  
  const toolInfo = getToolInfo(toolName, changelogUrl);
  const dataDirName = getDataDirName(toolInfo.name);
  const dataDir = join(homedir(), `.${dataDirName}-changelog`);
  const changelogFile = join(dataDir, "changelog.json");
  
  return {
    toolInfo,
    dataDir,
    changelogFile
  };
};

// Ensure data directory exists
const ensureDataDir = (dataDir: string): void => {
  if (!existsSync(dataDir)) {
    const fs = require("fs");
    fs.mkdirSync(dataDir, { recursive: true });
  }
};

// Clean up a description string - Better formatting preservation
const cleanDescriptionBlock = (desc: string): string => {
  if (!desc) return '';
  
  let cleaned = desc.trim();
  
  // Remove the version heading itself if it appears at the start (less aggressive)
  // cleaned = cleaned.replace(/^#{1,4}\\s+(?:Version\\s+|Release\\s+)?v?\[?[\\d\\w.\\-:]+\\)?.*\\n/i, '');
  
  // For GitHub blog style, remove date and categories if they appear right at the beginning
  cleaned = cleaned.replace(/^(?:[A-Za-z]+ \\d{1,2}, \\d{4})\\s*\\n+/, '');
  cleaned = cleaned.replace(/^(?:-\\s*\\[[^\\]]+\\](?:\\([^)]+\\))?\\s*\\n+)+/, ''); // Category lines
  
  // Keep section headers, just remove some common but redundant ones at the start
  cleaned = cleaned.replace(/^#{1,4}\\s+(?:Changes|What's Changed|Changelog|Summary|Highlights|Overview)\\s*\\n+/i, '');
  
  // Preserve important formatting while cleaning up:
  // 1. Normalize line endings
  cleaned = cleaned.replace(/\\r\\n?/g, '\\n');
  
  // 2. Collapse excessive newlines but preserve paragraph breaks
  cleaned = cleaned.replace(/\\n{3,}/g, '\\n\\n');
  
  // 3. Preserve subheadings, bullet points, and other meaningful formatting
  const lines = cleaned.split('\\n');
  let insideCodeBlock = false;
  const processedLines = lines.map(line => {
    if (line.trim().startsWith('```')) {
      insideCodeBlock = !insideCodeBlock;
      return line; // Keep code block delimiters and content as is
    }
    if (insideCodeBlock) {
      return line; // Keep code block content as is
    }
    // Keep markdown headers, lists, blockquotes, horizontal rules
    if (/^#+\\s+/.test(line) || 
        /^[-*•>]\\s+/.test(line) || 
        /^\\d+\\.\\s+/.test(line) ||
        /^[-*_]{3,}$/.test(line.trim())) {
      return line;
    }
    // Trim other lines
    return line.trim();
  }).filter(line => line !== null); // Filter out potentially empty lines after trimming if desired

  // 4. Join lines back together
  cleaned = processedLines.join('\\n');

  // 5. Clean up common markdown artifacts or redundant text
  cleaned = cleaned.replace(/^\s*[-*=_]{3,}\s*$/gm, ''); // Remove separator lines unless intended as HR
  cleaned = cleaned.replace(/^[-*•]\\s*$/gm, ''); // Remove empty bullet points
  cleaned = cleaned.replace(/\\[See more\\]\\([^)]+\\)/gi, ''); // Remove "[See more](...)" links
  cleaned = cleaned.replace(/\\[Read more\\]\\([^)]+\\)/gi, ''); // Remove "[Read more](...)" links
  cleaned = cleaned.replace(/\\[Learn more\\]\\([^)]+\\)/gi, ''); // Remove "[Learn more](...)" links
  cleaned = cleaned.replace(/\\[(Full Changelog|compare view)\\]\\([^)]+\\)/gi, ''); // Remove common footer links
  cleaned = cleaned.replace(/Thanks to all contributors!/gi, '');
  cleaned = cleaned.replace(/What's Changed/gi, '');
  cleaned = cleaned.replace(/## Contributors/gi, ''); // Remove contributor sections often at the end

  // 6. Final cleanup of consecutive blank lines and trailing/leading space
  cleaned = cleaned.replace(/\\n{3,}/g, '\\n\\n').trim();
  
  // 7. Ensure section headers stand out (add newline after if needed) - Be careful not to add too many
  // cleaned = cleaned.replace(/^(#{1,3}\\s+.+[^\\n])$/gm, '$1\\n'); // Add newline after headers
  // cleaned = cleaned.replace(/^(\\*\\*.+?\\*\\*[^\\n])$/gm, '$1\\n'); // Add newline after bold lines (potential headers)

  // 8. Remove excessive spaces between lines
  cleaned = cleaned.replace(/\\n\\s+\\n/g, '\\n\\n');

  // 9. Remove redundant "iframe" markers from GitHub blog (usually embedded videos)
  cleaned = cleaned.replace(/\\[iframe\\]/g, '');
  
  return cleaned.trim();
};


// Extract meaningful links (GitHub releases, documentation) from content and avoid image links
const extractDetailLink = (headingLine: string, contentBlock: string): string | undefined => {
  // Priority 1: Link directly in the heading (e.g., GitHub Blog: ## [Title](link))
  const headingLinkMatch = headingLine.match(/\[([^\]]+)\]\(([^)]+)\)/); // Correct regex for [text](url)
  if (headingLinkMatch && headingLinkMatch[2] && !headingLinkMatch[2].match(/\.(?:png|jpg|jpeg|gif|svg|webp)$/i)) {
    console.log(`DEBUG: Extracted link from heading: ${headingLinkMatch[2]}`);
    return headingLinkMatch[2];
  }

  // Priority 2: Explicit "Release Notes", "Full Changelog", "Compare", "Details" links
  const explicitLinkPatterns = [
    /\b(?:release notes?|full changelog|details|compare view|view release|release page)\b.*?\((https?:\/\/[^)]+)\)/i, // Corrected Regex
    /\((https?:\/\/github\.com\/[^\/]+\/[^\/]+\/(?:releases|compare|commit|tree|tag)[^)]+)\)/i // Corrected Regex
  ];
  for (const pattern of explicitLinkPatterns) {
    const explicitMatch = contentBlock.match(pattern);
    if (explicitMatch && explicitMatch[1]) {
      console.log(`DEBUG: Extracted explicit link: ${explicitMatch[1]}`);
      return explicitMatch[1];
    }
  }

  // Priority 3: "See more", "Read more", "Learn more" links
  const moreLinkMatch = contentBlock.match(/\\[(?:See|Read|Learn) more\\]\\(([^)]+)\\)/i);
  if (moreLinkMatch && moreLinkMatch[1]) {
    console.log(`DEBUG: Extracted 'more' link: ${moreLinkMatch[1]}`);
    return moreLinkMatch[1];
  }

  // Priority 4: Any other non-image markdown link in the content block
  const genericLinkRegex = /\[([^\]]+)\]\(([^)]+)\)/g; // Correct regex for [text](url)
  let genericMatch;
  while ((genericMatch = genericLinkRegex.exec(contentBlock)) !== null) {
    const linkText = genericMatch[1];
    const linkUrl = genericMatch[2];
    // Basic check to avoid image links
    if (!linkUrl.match(/\\.(?:png|jpg|jpeg|gif|svg|webp)$/i) && !linkText.match(/^!/)) {
      console.log(`DEBUG: Extracted generic markdown link: ${linkUrl}`);
      return linkUrl; // Return the first relevant one found
    }
  }

  // Priority 5: Raw URLs (prioritize GitHub, official docs)
  const urlRegex = /(https?:\/\/[^\s<>)]+)/g; // Further simplified regex
  const priorityUrls: string[] = [];
  const otherUrls: string[] = [];
  let urlMatch;
  while ((urlMatch = urlRegex.exec(contentBlock)) !== null) {
    const url = urlMatch[1];
    // Skip common image hosts or extensions
    if (url.match(/\\.(?:png|jpg|jpeg|gif|svg|webp)$/i) || url.includes('imgur.com') || url.includes('imageshack.us')) {
      continue;
    }
    // Prioritize official / relevant domains
    if (url.match(/github\.com|gitlab\.com|bitbucket\.org|jetbrains\.com|visualstudio\.com|microsoft\.com|eclipse\.dev|neovim\.io|sublimetext\.com|vim\.org|git-scm\.com/)) {
      priorityUrls.push(url);
    } else {
      otherUrls.push(url);
    }
  }
  if (priorityUrls.length > 0) {
    console.log(`DEBUG: Extracted priority raw URL: ${priorityUrls[0]}`);
    return priorityUrls[0];
  }
  if (otherUrls.length > 0) {
    console.log(`DEBUG: Extracted other raw URL: ${otherUrls[0]}`);
    return otherUrls[0]; // Return the first non-priority URL found
  }

  return undefined;
};


// Validate if a string looks like a valid version identifier OR a descriptive title for changelog headings
// Returns the extracted version/title string if valid, otherwise null.
const extractValidVersionOrTitle = (headingText: string): string | null => {
  if (!headingText || typeof headingText !== 'string') return null;

  const trimmedText = headingText.trim();
  if (trimmedText.length === 0) return null;

  // Handle GitHub/Cursor style linked headings: [Title](URL)
  const linkedTitleMatch = trimmedText.match(/^\[(.*?)\]\(.*?\)$/);
  if (linkedTitleMatch && linkedTitleMatch[1] && linkedTitleMatch[1].length > 5) {
    console.log(`DEBUG: Accepted linked title: "${linkedTitleMatch[1]}"`);
    return linkedTitleMatch[1]; // Return the title part without the link
  }

  // 1. Direct Version Patterns (Semantic, Date, Build, IDE-specific)
  const versionPatterns = [
    /(?:^|\\s)(v?\d+\.\d+(?:\.\d+){0,2}(?:[-_][a-zA-Z0-9.-]+)?)(?:$|\\s)/i, // v1.2.3, 1.2.3-beta.1, 1.2.3.4
    /(?:^|\\s)(\d{4}[-./]\d{1,2}[-./]\d{1,2})(?:$|\\s)/,                  // 2023-01-25, 2023.01.25
    /(?:^|\\s)(\d{4}\.\d{1,2}(?:\.\d{1,2})?)(?:$|\\s)/,                   // 2023.1, 2023.1.2 (JetBrains)
    /(?:^|\\s)(?:Build|Patch)\s+(\d+(\.\d+)*)(?:$|\\s)/i,                 // Build 12345, Patch 9.0.1234
    /(?:^|\\s)SP(\d+)(?:$|\\s)/i,                                         // SP1
    /(?:^|\\s)R(\d{4}[a-z])(?:$|\\s)/i,                                    // R2023a (MATLAB)
    /(?:^|\\s)(\d+\.\d+\.x)(?:$|\\s)/i                                    // 0.48.x (Cursor style)
  ];

  for (const pattern of versionPatterns) {
    const match = trimmedText.match(pattern);
    if (match && match[1]) {
       // Basic sanity check: avoid matching year alone if it's part of a longer title
       if (match[1].length === 4 && /^\d{4}$/.test(match[1]) && trimmedText.split(/\s+/).length > 2) {
           // Likely just a year in a title, continue checking
       } else {
            console.log(`DEBUG: Matched direct version pattern: ${match[1]} in "${trimmedText}"`);
            return match[1]; // Return the captured version string
       }
    }
  }

  // 2. Descriptive Titles (GitHub Blog style, GitLab release titles, etc.)
  // Accept titles that are reasonably long and don't look like generic section headers.
  const commonSectionHeaders = /^(?:features?|bug ?fixes?|fixe?d|enhancements?|improvements?|changes?|added|removed|deprecated|security|what'?s new|highlights?|details?|summary|overview|unreleased|upcoming|current|next|pending|contributors|other)$/i;
  if (trimmedText.length >= 5 && trimmedText.length <= 150 && !commonSectionHeaders.test(trimmedText)) {
      // Further check: does it contain *some* likely version indicator or release keyword?
      if (/\d|release|update|version|build|patch|edition|changelog|announcement|month|year|week|day/i.test(trimmedText)) {
          console.log(`DEBUG: Accepted descriptive title: "${trimmedText}"`);
          return trimmedText; // Return the full title as the "version" identifier
      }
      // Special case: GitHub blog titles in brackets
      if (trimmedText.startsWith('[') && trimmedText.endsWith(']')) {
          const innerTitle = trimmedText.slice(1, -1);
          if (innerTitle.length >= 5 && !commonSectionHeaders.test(innerTitle)) {
              console.log(`DEBUG: Accepted GitHub blog title (in brackets): "${innerTitle}"`);
              return innerTitle;
          }
      }
  }

  // 3. Handle "Unreleased" section explicitly
   if (/^unreleased$/i.test(trimmedText)) {
       console.log(`DEBUG: Matched "Unreleased" section`);
       return "Unreleased";
   }

  console.log(`DEBUG: Rejected heading as version/title: "${trimmedText}"`);
  return null; // Not a valid version or recognized title format
};


// --- Unified Block Extraction ---
// Strategy: Iterate line by line, identify potential version headers, and group content.
const extractChangelogBlocks = (markdownContent: string): Record<string, { description: string; detailLink?: string }> => {
  console.log("DEBUG: --- Starting Unified Block Extraction (Line-by-Line) ---");
  const entries: Record<string, { description: string; detailLink?: string }> = {};
  const lines = markdownContent.split('\n');
  
  let currentBlock = { version: '', headingLine: '', contentLines: [] as string[], headingLevel: 0 };
  let inCodeBlock = false;

  console.log(`DEBUG: Processing document with ${lines.length} lines`);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();

    // Track code blocks
    if (trimmedLine.startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      if (currentBlock.version) currentBlock.contentLines.push(line);
      continue;
    }
    if (inCodeBlock) {
      if (currentBlock.version) currentBlock.contentLines.push(line);
      continue;
    }

    // Check for potential headings (##, ###, etc.)
    const headingMatch = trimmedLine.match(/^(#+)\s+(.*)/);
    
    // Check for GitHub-style link headings: ## [Title](URL)
    const linkHeadingMatch = headingMatch && headingMatch[2].match(/^\[(.*?)\]\((.*?)\)$/);
    
    if (headingMatch) {
      const level = headingMatch[1].length;
      const headingText = headingMatch[2].trim();
      
      // Extract link if present for detail link
      let detailLink = null;
      if (linkHeadingMatch) {
        detailLink = linkHeadingMatch[2]; // The URL part
      }

      // Try to validate if this heading text represents a version or a title
      const potentialVersionOrTitle = extractValidVersionOrTitle(headingText);

      if (potentialVersionOrTitle) {
        console.log(`DEBUG: Potential Version/Title heading found: '${potentialVersionOrTitle}' Level: ${level} Line: "${trimmedLine}"`);

        // Process the *previous* block if it exists and has content
        if (currentBlock.version && currentBlock.contentLines.length > 0) {
          const description = cleanDescriptionBlock(currentBlock.contentLines.join('\n'));
          if (description.length > 5) { // Basic check for non-empty description
            const blockDetailLink = extractDetailLink(currentBlock.headingLine, description) || 
                                    (currentBlock.headingLine.match(/\]\((.*?)\)/) || [])[1]; // Extract link from heading
            
            // Only add/update if this version isn't already captured or if the new description is longer
            if (!entries[currentBlock.version] || description.length > (entries[currentBlock.version]?.description?.length || 0)) {
              console.log(`DEBUG: Saving block for version/title ${currentBlock.version}. Desc Length: ${description.length}`);
              entries[currentBlock.version] = { 
                description, 
                detailLink: blockDetailLink || entries[currentBlock.version]?.detailLink 
              };
            } else {
               console.log(`DEBUG: Skipping duplicate or shorter block for ${currentBlock.version}`);
            }
          } else {
            console.log(`DEBUG: Skipping empty block for version ${currentBlock.version}`);
          }
        }

        // Start the new block
        currentBlock = {
          version: potentialVersionOrTitle,
          headingLine: line, // Store the original line for link extraction later
          contentLines: [],
          headingLevel: level
        };
        continue; // Move to the next line after processing the header
      }
    }

    // If it's not a new version header, and we are inside a block, add the line to content
    if (currentBlock.version) {
      currentBlock.contentLines.push(line);
    }
  }

  // Process the very last block after the loop finishes
  if (currentBlock.version && currentBlock.contentLines.length > 0) {
    const description = cleanDescriptionBlock(currentBlock.contentLines.join('\n'));
    if (description.length > 5) {
      const detailLink = extractDetailLink(currentBlock.headingLine, description) || 
                         (currentBlock.headingLine.match(/\]\((.*?)\)/) || [])[1]; // Extract link from heading
      
      if (!entries[currentBlock.version] || description.length > (entries[currentBlock.version]?.description?.length || 0)) {
          console.log(`DEBUG: Saving final block for version/title ${currentBlock.version}. Desc Length: ${description.length}`);
          entries[currentBlock.version] = { 
            description, 
            detailLink: detailLink || entries[currentBlock.version]?.detailLink 
          };
      } else {
          console.log(`DEBUG: Skipping duplicate or shorter final block for ${currentBlock.version}`);
      }
    } else {
        console.log(`DEBUG: Skipping empty final block for version ${currentBlock.version}`);
    }
  }

  // --- Final Cleanup ---
  let removedCount = 0;
  for (const version in entries) {
      // Remove entries where the description is essentially just the version identifier again or too short
      const desc = entries[version].description.trim();
      const versionIdentifier = version.replace(/^v/i, '').trim();
      if (desc.length < 15 || desc === versionIdentifier || desc.toLowerCase() === `version ${versionIdentifier}`.toLowerCase()) {
          console.log(`DEBUG: Removing block "${version}" due to minimal/redundant description.`);
          delete entries[version];
          removedCount++;
      }
  }
  console.log(`DEBUG: Removed ${removedCount} blocks during final cleanup.`);

  console.log(`DEBUG: Found ${Object.keys(entries).length} final blocks after unified extraction.`);
  console.log("DEBUG: --- Finished Unified Block Extraction ---");
  return entries;
};

// Specialized extraction for Cursor-style changelogs which have a specific format
const extractCursorChangelog = (markdownContent: string): Record<string, { description: string; detailLink?: string }> => {
  console.log("DEBUG: --- Extracting Cursor Style Changelog Entries ---");
  const entries: Record<string, { description: string; detailLink?: string }> = {};
  
  // Find version sections like "0.48.x"
  const versionRegex = /^(\d+\.\d+\.x)$/m;
  const versionMatches = markdownContent.match(versionRegex);
  
  if (versionMatches && versionMatches[1]) {
    console.log(`DEBUG: Found Cursor version number: ${versionMatches[1]}`);
    // Store the version number as its own entry
    entries[versionMatches[1]] = {
      description: `Cursor ${versionMatches[1]} updates`,
      detailLink: null
    };
  }
  
  // Find entries with GitHub-style linked titles: ## [Title](URL)
  const linkTitleRegex = /^#{2}\s+\[(.*?)\]\((https?:\/\/[^)]+)\)/gm;
  let match;
  while ((match = linkTitleRegex.exec(markdownContent)) !== null) {
    const title = match[1];
    const url = match[2];
    
    // Find the content between this heading and the next heading
    const startPos = match.index + match[0].length;
    const nextHeadingMatch = markdownContent.slice(startPos).match(/^#{2}\s+/m);
    const endPos = nextHeadingMatch 
      ? startPos + nextHeadingMatch.index
      : markdownContent.length;
    
    const content = markdownContent.slice(startPos, endPos).trim();
    
    if (content.length > 10) {
      console.log(`DEBUG: Found Cursor entry with title: ${title}`);
      entries[title] = {
        description: cleanDescriptionBlock(content),
        detailLink: url
      };
    }
  }
  
  console.log(`DEBUG: Found ${Object.keys(entries).length} Cursor style changelog entries`);
  return entries;
};

// Update the updateChangelog function to include the Cursor-specific extraction
export const updateChangelog = async (apiKey: string, toolName?: string, changelogUrl?: string): Promise<ChangelogEntry[]> => {
  const toolData = await getToolData(toolName, changelogUrl);
  const { toolInfo, dataDir, changelogFile } = toolData;
  
  console.log(`\n\n--- Starting Changelog Update for ${toolInfo.name} ---`);
  console.log(`Using URL: ${toolInfo.url}`);
  
  try {
    ensureDataDir(dataDir);
    
    const app = new FirecrawlApp({ apiKey });
    
    console.log(`Scraping changelog for ${toolInfo.name}...`);
    
    // Get tool-specific scraping configuration
    const scrapingConfig = getScrapingConfig(toolInfo.name);
    
    // Build options with tool-specific configuration
    const scrapeOptions = { 
      timeout: 45000,
      formats: ["markdown", "rawHtml"] as ("markdown" | "rawHtml")[],
      onlyMainContent: true,
      excludeTags: scrapingConfig.excludeTags || ["iframe", "script", "style", "noscript", "svg"],
      waitFor: scrapingConfig.waitFor || 2000
    };
    
    // Add content selector if available
    if (scrapingConfig.contentSelector) {
      console.log(`DEBUG: Using custom content selector: ${scrapingConfig.contentSelector}`);
      // Note: contentSelector is not directly supported in the current Firecrawl API,
      // but we're preparing it for future use or custom implementation
      // For now, we'll rely on onlyMainContent: true for similar functionality
    }
    
    const response = await app.scrapeUrl(toolInfo.url, scrapeOptions); 
    
    const anyResponse = response as any;
    
    // Check if the response indicates success and contains markdown content
    let markdownContent: string | null = null;
    let success = false;
    let errorMsg = "Unknown Firecrawl error";

    if (anyResponse && typeof anyResponse === 'object') {
        success = anyResponse.success === true;
        // Prefer markdown, but fallback to rawHtml if markdown is empty/missing
        if (typeof anyResponse.markdown === 'string' && anyResponse.markdown.trim().length > 50) { // Require some substance
            markdownContent = anyResponse.markdown;
            console.log("DEBUG: Successfully extracted non-empty markdown content.");
        } else if (typeof anyResponse.data?.rawHtml === 'string' && anyResponse.data.rawHtml.trim().length > 100) {
             console.log("DEBUG: Markdown empty or short, falling back to raw HTML.");
             // Improved HTML to Markdown conversion
             let html = anyResponse.data.rawHtml;
             
             // Preserve headers
             html = html.replace(/<h([1-6])[^>]*>(.*?)<\/h\1>/gi, (_, level, content) => {
                 const headerMarkers = '#'.repeat(parseInt(level));
                 return `\n${headerMarkers} ${content.trim()}\n`;
             });
             
             // Preserve lists
             html = html.replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n');
             
             // Preserve paragraphs
             html = html.replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n');
             
             // Preserve links
             html = html.replace(/<a[^>]*href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gi, '[$2]($1)');
             
             // Replace breaks with newlines
             html = html.replace(/<br\s*\/?>/gi, '\n');
             
             // Replace horizontal rules
             html = html.replace(/<hr[^>]*>/gi, '\n---\n');
             
             // Strip remaining tags
             html = html.replace(/<[^>]+>/g, '');
             
             // Fix extra whitespace and newlines
             html = html.replace(/\n{3,}/g, '\n\n');
             html = html.trim();
             
             markdownContent = html;
        }
    }

    if (!success || !markdownContent) {
        console.error(`Firecrawl scraping failed: ${errorMsg}`);
        console.error("Falling back to existing changelog data.");
        return loadChangelog(toolName, changelogUrl);
    }

    console.log(`DEBUG: Received Content Snippet (first 1000 chars):`);
    console.log(markdownContent.slice(0, 1000) + '...');
    
    // Store the raw content in debug file
    writeFileSync(join(dataDir, `raw_content_${toolInfo.name}.md`), markdownContent);
    
    // Special handling for Cursor changelog which has a unique format
    let allPatches: Record<string, { description: string; detailLink?: string }> = {};
    
    if (toolInfo.name === "Cursor") {
      console.log("Using specialized Cursor changelog extraction...");
      allPatches = extractCursorChangelog(markdownContent);
    } else {
      // Standard extraction for other tools
      console.log("Using unified block extraction strategy...");
      allPatches = extractChangelogBlocks(markdownContent);
    }
    
    console.log(`DEBUG: Total blocks extracted: ${Object.keys(allPatches).length}`);

    if (Object.keys(allPatches).length === 0) {
      console.warn(`WARN: No changelog entries extracted for ${toolInfo.name}. The page structure might be unsupported or content too minimal.`);
      // Return empty or existing, but log prominently.
      // Maybe write the raw content to a debug file?
      writeFileSync(join(dataDir, `failed_extraction_${toolInfo.name}.md`), markdownContent);
      console.log(`DEBUG: Wrote raw content to failed_extraction_${toolInfo.name}.md for review.`);
      return loadChangelog(toolName, changelogUrl); // Return old data on failure
    }

    // Consolidate/Sort versions
    const changelog = consolidateVersions(allPatches);
    
    // Save to file
    console.log(`Saving ${changelog.length} processed entries to ${changelogFile}`);
    writeFileSync(changelogFile, JSON.stringify(changelog, null, 2));
    
    console.log(`--- Changelog Update for ${toolInfo.name} Finished Successfully ---`);
    return changelog;
  } catch (error: any) {
    console.error(`An error occurred during scraping or processing for ${toolInfo.name}: ${error.message || error}`);
    // Optionally log stack trace for debugging
     console.error(error.stack);
     console.log(`--- Changelog Update for ${toolInfo.name} Failed ---`);
    // Load existing data if update fails to avoid showing nothing
    return loadChangelog(toolName, changelogUrl); 
    // throw error; // Re-throw if the calling function should handle it
  }
};

// Load the changelog from file
export const loadChangelog = async (toolName?: string, changelogUrl?: string): Promise<ChangelogEntry[]> => {
  const { dataDir, changelogFile } = await getToolData(toolName, changelogUrl);
  
  ensureDataDir(dataDir);
  
  if (!existsSync(changelogFile)) {
     console.log(`Changelog file not found: ${changelogFile}. Returning empty list.`);
    return [];
  }
  
  try {
    const data = readFileSync(changelogFile, "utf-8");
    const parsedData = JSON.parse(data) as ChangelogEntry[];
    console.log(`Loaded ${parsedData.length} entries from ${changelogFile}`);
    
    // Ensure entries are correctly sorted newest first
    if (parsedData.length > 0) {
      // Log the first few entries to debug ordering issues
      console.log(`DEBUG: First entries before re-sorting: ${parsedData.slice(0, 3).map(e => e.version).join(', ')}...`);
      
      // Re-sort to ensure consistent ordering
      const sortedData = parsedData.sort((a, b) => compareVersions(b.version, a.version));
      
      // Log after sorting
      console.log(`DEBUG: First entries after re-sorting: ${sortedData.slice(0, 3).map(e => e.version).join(', ')}...`);
      
      return sortedData;
    }
    
    return parsedData;
  } catch (error) {
    console.error(`Error loading changelog from ${changelogFile}: ${error}`);
    // Attempt to delete corrupted file? Or just return empty
    // try { unlinkSync(changelogFile); } catch (e) {}
    return [];
  }
};

// Get the latest version entry
export const getLatestVersion = async (toolName?: string, changelogUrl?: string): Promise<ChangelogEntry | null> => {
  const changelog = await loadChangelog(toolName, changelogUrl);
  
  if (changelog.length === 0) {
     console.log("getLatestVersion: Changelog is empty.");
    return null;
  }
  
  // Log all entries to help with debugging
  console.log(`DEBUG: All available entries in order: ${changelog.map(entry => entry.version).join(', ')}`);
  
  // Special handling for Cursor - prioritize version numbers like "0.48.x" over descriptive titles
  if (toolName === "Cursor" || (changelogUrl && changelogUrl.includes("cursor.com"))) {
    // First, look for entries matching the "0.48.x" pattern
    const versionEntries = changelog.filter(entry => /^\d+\.\d+\.x$/.test(entry.version));
    if (versionEntries.length > 0) {
      console.log(`getLatestVersion: Found Cursor version entry: ${versionEntries[0].version}`);
      return versionEntries[0];
    }
  }
  
  // The changelog should already be sorted latest first by consolidateVersions
  // Return the first entry, as it should be the latest.
  // Add a check for "Unreleased" and potentially skip it if a specific version exists next.
  if (changelog[0].version === "Unreleased" && changelog.length > 1) {
      console.log("getLatestVersion: Skipping 'Unreleased', returning next entry:", changelog[1].version);
      return changelog[1];
  }
  
  console.log("getLatestVersion: Returning first entry:", changelog[0].version);
  return changelog[0];
};

// Consolidate versions - Primarily sorts entries now.

// Check if a string *could* be a valid version number - More flexible approach
const isValidVersion = (version: string): boolean => {
  if (!version || typeof version !== 'string' || version.trim().length === 0) {
    return false;
  }
  // Trim and remove leading 'v' or 'V'
  const cleanVersion = version.trim().replace(/^[vV]/, '');

  // Rule 1: Must contain at least one digit.
  if (!/\d/.test(cleanVersion)) {
    // Allow date-format versions (YYYY-MM-DD, YYYY.MM.DD)
    if (!/^[0-9]{4}[-./][0-9]{1,2}[-./][0-9]{1,2}$/.test(cleanVersion)) {
      // Special case: For GitHub blog-style titles (which might not have digits)
      // Accept if it's a reasonable length title (not too short, not too long)
      if (version.length >= 5 && version.length <= 100 && 
          !version.match(/^(?:features|bug fixes|improvements|changes|added|fixed|removed|deprecated|what's new)$/i)) {
        console.log(`DEBUG: isValidVersion accepted GitHub blog title: '${version}'`);
        return true;
      }
      
      // Special case: For JetBrains "What's New in Version X" style titles
      if (version.match(/what'?s new|update|release notes/i) && /\d+/.test(version)) {
        console.log(`DEBUG: isValidVersion accepted JetBrains/doc-style title: '${version}'`);
        return true;
      }
      
      console.log(`DEBUG: isValidVersion rejected '${version}' (no digit and not date)`);
      return false;
    }
  }

  // Rule 2: Basic sanity checks - avoid full sentences, excessive length, common non-version words.
  if (cleanVersion.length > 40) {
    console.log(`DEBUG: isValidVersion rejected '${version}' (too long)`);
    return false;
  }
  
  // Allow spaces for certain formats like "1.0 Beta 2" or "2.3 (Stable)"
  if (cleanVersion.split(' ').length > 4) {
    console.log(`DEBUG: isValidVersion rejected '${version}' (too many spaces)`);
    return false;
  }
  
  // Avoid common section headers being mistaken for versions
  if (/^(?:features|bug fixes|improvements|changes|added|fixed|removed|deprecated|security|what's new|highlights|details)$/i.test(cleanVersion)) {
    console.log(`DEBUG: isValidVersion rejected '${version}' (looks like section header)`);
    return false;
  }

  // Accept common version patterns:
  // - Standard semantic versions: 1.2.3, 1.2.3.4
  // - Date-based versions: 2023.01.25, 2023-01-25
  // - Version ranges: 1.2-1.3
  // - Versions with suffixes: 1.2.3-beta2, 2.0_RC1
  // - Single numbers (if not too generic): 10, 2023
  // - IDE style versions: 2023.1, 2023.2.3
  const commonVersionPatterns = [
    /^\d+\.\d+(\.\d+)*$/, // Semantic version: 1.2.3, 1.2.3.4
    /^\d+\.\d+(\.\d+)*[-_](alpha|beta|rc|dev|preview|pre|nightly|eap)[\d]*$/i, // Version with suffix: 1.2.3-beta2
    /^\d{4}[-.\/]\d{1,2}[-.\/]\d{1,2}$/, // Date-based: 2023.01.25, 2023-01-25
    /^\d+\.\d+-\d+\.\d+$/, // Version range: 1.2-1.3
    /^\d{4,}$/, // Year or build number: 2023, 10234
    /^\d{4}\.\d+(\.\d+)?$/, // JetBrains IDE style: 2023.1, 2023.2.3
    /^Build \d+(\.\d+)*$/i, // Build style: Build 12345
    /^R\d+(\.\d+)*$/i, // R style: R2023a
    /^SP\d+$/i, // Service Pack style: SP1
    /^v\d{4,}\s+(?:update|edition|release)/i, // "v2023 Update 2"
    /^(?:update|release)\s+\d+/i, // "Update 5"
    /^(?:visual studio|vs)\s+\d{4}/i // "Visual Studio 2022"
  ];
  
  if (commonVersionPatterns.some(pattern => pattern.test(cleanVersion.split(' ')[0]))) {
    console.log(`DEBUG: isValidVersion accepted pattern match: '${version}'`);
    return true;
  }

  // Special patterns for IDE and tool versions
  const specialVersionPatterns = [
    /^(?:version|release)?\s*\d+\.\d+(\.\d+)*/i, // "Version 1.2.3"
    /^\d{4}\s+(?:update|edition|release)/i, // "2023 Update 2"
    /^v\d{4,}\s+(?:update|edition|release)/i, // "v2023 Update 2"
    /^(?:update|release)\s+\d+/i, // "Update 5"
    /^(?:visual studio|vs)\s+\d{4}/i // "Visual Studio 2022"
  ];
  
  if (specialVersionPatterns.some(pattern => pattern.test(version))) {
    console.log(`DEBUG: isValidVersion accepted special pattern: '${version}'`);
    return true;
  }

  // For more complex cases with spaces, check if the first part is version-like
  if (cleanVersion.includes(' ')) {
    const firstPart = cleanVersion.split(' ')[0];
    if (commonVersionPatterns.some(pattern => pattern.test(firstPart))) {
      console.log(`DEBUG: isValidVersion accepted complex format: '${version}'`);
      return true;
    }
  }

  // Final fallback rule: Should generally consist of digits, dots, dashes - but be permissive
  if (/^[\w.\-_+]+$/.test(cleanVersion.split(' ')[0])) {
    console.log(`DEBUG: isValidVersion accepted using fallback rule: '${version}'`);
    return true;
  }

  console.log(`DEBUG: isValidVersion rejected '${version}' (no pattern match)`);
  return false;
};


// Validate if a string looks like a valid version identifier for changelog headings
const isValidVersionHeader = (version: string, fullHeading: string): boolean => {
  if (!version || typeof version !== 'string' || version.trim().length === 0) {
    return false;
  }
  
  // Clean version
  const cleanVersion = version.trim();
  
  // Allow "Unreleased" section common in Keep a Changelog format
  if (/^unreleased$/i.test(cleanVersion)) {
    return true;
  }
  
  // Explicit version indicators in heading
  if (/version|release|update|v\.?\s*\d|build\s+\d|sp\d|\d{4}\.\d+/i.test(fullHeading)) {
    if (cleanVersion.length < 60) {
      return true;
    }
  }

  // For GitHub blog style titles (validate any reasonable title that's not too long)
  if (fullHeading.match(/^#{1,3}\s+\[[^\]]+\]\([^)]+\)$/)) {
    // Allow any title that doesn't contain common non-version words and isn't too long
    if (cleanVersion.length < 100 && 
        !cleanVersion.match(/^(?:features|bug\s*fixes|improvements|changes|added|fixed|removed|deprecated)$/i)) {
      return true;
    }
  }
  
  // JetBrains style
  if (fullHeading.match(/what'?s new|update|release/i) && /\d+/.test(fullHeading)) {
    return true;
  }
  
  // Microsoft style
  if (fullHeading.match(/visual studio|vs\s+\d{4}|update|release/i) && /\d+/.test(fullHeading)) {
    return true;
  }
  
  // Common version patterns
  const versionPatterns = [
    /^\d+\.\d+(\.\d+)*(-\w+(\.\d+)?)?$/,  // Semantic version: 1.2.3, 1.2.3-beta.1
    /^v\d+\.\d+(\.\d+)*(-\w+(\.\d+)?)?$/i, // Prefixed: v1.2.3, V1.2.3-rc.1
    /^\d{4}[-.\/]\d{1,2}[-.\/]\d{1,2}$/,  // Date-based: 2023.01.25, 2023-01-25
    /^\d{8}$/,                             // Date-based compact: 20230125
    /^\d+\.\d+(-|to|\s*[-–—]\s*)\d+\.\d+$/, // Version range: 1.2-1.3, 1.2 to 1.3
    /^\d{4}$/,                              // Single year: 2023
    /^\d{4}\.\d+(\.\d+)?$/,                 // JetBrains style: 2023.1, 2023.1.2
    /^Build\s+\d+(\.\d+)*$/i,               // Build style: Build 12345
    /^SP\d+$/i,                             // Service Pack: SP1
    /^R\d{4}[a-z]$/i                        // MATLAB style: R2023a
  ];
  
  // Check against common patterns
  if (versionPatterns.some(pattern => pattern.test(cleanVersion))) {
    return true;
  }
  
  // Check for alpha/beta/rc versions
  if (/^\d+\.\d+.*(?:alpha|beta|rc|preview)/i.test(cleanVersion)) {
    return true;
  }
  
  // If it contains digits and is reasonably short, it might be a version
  if (/\d/.test(cleanVersion) && cleanVersion.length < 15) {
    return true;
  }
  
  // Doesn't match any version pattern
  return false;
};

// Consolidate versions - Handles semantic, date, and simple versions
const consolidateVersions = (patchesDict: Record<string, { description: string; detailLink?: string }>): ChangelogEntry[] => {
  console.log("DEBUG: --- Starting consolidateVersions ---");
  console.log(`DEBUG: Consolidating ${Object.keys(patchesDict).length} raw blocks.`);
  
  // First, create a list of all unique versions (keys)
  const allVersions = Object.keys(patchesDict);
  
  // Process each entry individually first to ensure no important data is lost
  const consolidated: ChangelogEntry[] = [];
  
  for (const version of allVersions) {
    const data = patchesDict[version];
    // Skip entries without meaningful descriptions
    if (!data || !data.description || data.description.length < 10) {
      console.log(`DEBUG: Skipping consolidation for short/empty description for version ${version}`);
      continue;
    }
    
    // Add entry directly to consolidated list
    consolidated.push({
      version: version,
      description: data.description,
      detailLink: data.detailLink
    });
    
    console.log(`DEBUG: Added version ${version} as individual entry`);
  }
  
  // Sort by version (newest first using the custom sort)
  consolidated.sort((a, b) => compareVersions(b.version, a.version));
  
  console.log(`DEBUG: Final consolidated count: ${consolidated.length}`);
  console.log("DEBUG: --- Finished consolidateVersions ---");
  return consolidated;
};

// Advanced version comparison for sorting
const compareVersions = (a: string, b: string): number => {
  console.log(`DEBUG: Comparing versions: '${a}' vs '${b}'`);
  
  // Special case for Cursor's version format like "0.48.x"
  const cursorVersionA = a.match(/^(\d+\.\d+)\.x$/);
  const cursorVersionB = b.match(/^(\d+\.\d+)\.x$/);
  
  if (cursorVersionA && !cursorVersionB) {
    // If a is a Cursor version but b isn't, prioritize a
    console.log(`DEBUG: '${a}' is a Cursor version format, prioritizing over '${b}'`);
    return 1;
  } else if (!cursorVersionA && cursorVersionB) {
    // If b is a Cursor version but a isn't, prioritize b
    console.log(`DEBUG: '${b}' is a Cursor version format, prioritizing over '${a}'`);
    return -1;
  } else if (cursorVersionA && cursorVersionB) {
    // Both are Cursor versions, compare the version numbers
    const majorMinorA = cursorVersionA[1].split('.').map(n => parseInt(n, 10));
    const majorMinorB = cursorVersionB[1].split('.').map(n => parseInt(n, 10));
    
    if (majorMinorA[0] !== majorMinorB[0]) {
      console.log(`DEBUG: Both are Cursor versions, comparing major: ${majorMinorB[0]} vs ${majorMinorA[0]}`);
      return majorMinorB[0] - majorMinorA[0]; // Sort by major version descending
    }
    console.log(`DEBUG: Both are Cursor versions, comparing minor: ${majorMinorB[1]} vs ${majorMinorA[1]}`);
    return majorMinorB[1] - majorMinorA[1]; // Sort by minor version descending
  }
  
  // Check if one is a typical version format and the other is a descriptive title
  const looksLikeVersionA = /^[v]?\d+(\.\d+)+/.test(a) || /^\d{4}[-./]\d{1,2}[-./]\d{1,2}$/.test(a);
  const looksLikeVersionB = /^[v]?\d+(\.\d+)+/.test(b) || /^\d{4}[-./]\d{1,2}[-./]\d{1,2}$/.test(b);
  
  // Date-based version detection
  const isDateA = /^\d{4}[-./]\d{1,2}[-./]\d{1,2}$/.test(a) || /^_?\d{4}[-./]\d{1,2}[-./]\d{1,2}_?$/.test(a);
  const isDateB = /^\d{4}[-./]\d{1,2}[-./]\d{1,2}$/.test(b) || /^_?\d{4}[-./]\d{1,2}[-./]\d{1,2}_?$/.test(b);
  
  // If one is a date and one isn't, prioritize the date
  if (isDateA && !isDateB) {
    console.log(`DEBUG: '${a}' is a date format, prioritizing over '${b}'`);
    return 1;
  }
  if (!isDateA && isDateB) {
    console.log(`DEBUG: '${b}' is a date format, prioritizing over '${a}'`);
    return -1;
  }
  
  // If one is a version number and the other is a description, prioritize the version number
  if (looksLikeVersionA && !looksLikeVersionB) {
    console.log(`DEBUG: '${a}' is a version number, prioritizing over '${b}'`);
    return 1;
  }
  if (!looksLikeVersionA && looksLikeVersionB) {
    console.log(`DEBUG: '${b}' is a version number, prioritizing over '${a}'`);
    return -1;
  }
  
  // For descriptive titles, compare based on the whole string
  if (!looksLikeVersionA && !looksLikeVersionB) {
    console.log(`DEBUG: Both are descriptive titles, comparing alphabetically (reversed): '${a}' vs '${b}'`);
    return b.localeCompare(a); // Alphabetical sorting for descriptive titles (reversed for newer first)
  }
  
  const result = compareVersionParts(a, b);
  console.log(`DEBUG: Standard version comparison result for '${a}' vs '${b}': ${result}`);
  return result;
};

// Helper function to compare version parts
const compareVersionParts = (a: string, b: string): number => {
  // Normalize version format first
  const cleanA = a.replace(/^[vV]/, '').trim().split(/\s+/)[0]; // Take only first part before any space
  const cleanB = b.replace(/^[vV]/, '').trim().split(/\s+/)[0]; // Take only first part before any space
  
  // Handle date-based versions (YYYY.MM.DD or similar)
  const isDateA = /^\d{4}[-./]\d{1,2}[-./]\d{1,2}$/.test(cleanA);
  const isDateB = /^\d{4}[-./]\d{1,2}[-./]\d{1,2}$/.test(cleanB);
  
  if (isDateA && isDateB) {
    // Compare dates: newer dates should come first
    const datePartsA = cleanA.split(/[-./]/).map(part => parseInt(part, 10)).filter(num => !isNaN(num));
    const datePartsB = cleanB.split(/[-./]/).map(part => parseInt(part, 10)).filter(num => !isNaN(num));
    
    for (let i = 0; i < Math.min(datePartsA.length, datePartsB.length); i++) {
      if (datePartsA[i] !== datePartsB[i]) {
        // For dates, we want descending order (newer first)
        return datePartsB[i] - datePartsA[i];
      }
    }
    
    // If all parts compared so far are equal, longer array (more specific date) wins
    return datePartsB.length - datePartsA.length;
  }
  
  // Handle semantic versions with potential suffixes
  const partsA = cleanA.split(/[-_.]/); // Split by common version separators
  const partsB = cleanB.split(/[-_.]/); // Split by common version separators
  
  const mainPartsA = partsA[0].split('.').map(p => /^\d+$/.test(p) ? parseInt(p, 10) : p);
  const mainPartsB = partsB[0].split('.').map(p => /^\d+$/.test(p) ? parseInt(p, 10) : p);
  
  // Compare main version components first (major.minor.patch)
  for (let i = 0; i < Math.max(mainPartsA.length, mainPartsB.length); i++) {
    const valA = mainPartsA[i];
    const valB = mainPartsB[i];
    
    // Handle undefined parts (e.g., comparing 1.2 vs 1.2.3)
    if (valA === undefined && valB !== undefined) return -1;
    if (valB === undefined && valA !== undefined) return 1;
    
    // Compare numbers numerically and strings lexicographically
    if (typeof valA === 'number' && typeof valB === 'number') {
      if (valA !== valB) return valB - valA; // Descending order
    } else if (typeof valA === 'number' && typeof valB === 'string') {
      return -1; // Numbers before strings
    } else if (typeof valA === 'string' && typeof valB === 'number') {
      return 1; // Strings after numbers
    } else {
      // String comparison for non-numeric parts
      const strA = String(valA).toLowerCase();
      const strB = String(valB).toLowerCase();
      
      if (strA !== strB) return strB.localeCompare(strA); // Descending order
    }
  }
  
  // If main parts are equal, check suffixes
  if (partsA.length > 1 || partsB.length > 1) {
    // Special handling for pre-release versions (alpha, beta, rc)
    const preReleaseOrder = ['alpha', 'beta', 'rc', 'preview', 'pre'];
    
    const suffixA = partsA.length > 1 ? partsA[1].toLowerCase() : '';
    const suffixB = partsB.length > 1 ? partsB[1].toLowerCase() : '';
    
    const preReleaseA = preReleaseOrder.findIndex(term => suffixA.includes(term));
    const preReleaseB = preReleaseOrder.findIndex(term => suffixB.includes(term));
    
    if (preReleaseA !== -1 && preReleaseB !== -1) {
      if (preReleaseA !== preReleaseB) return preReleaseA - preReleaseB;
    } else if (preReleaseA !== -1) {
      return -1; // Pre-release versions come before regular versions
    } else if (preReleaseB !== -1) {
      return 1;
    }
    
    // If both have suffixes but not pre-release, compare them lexicographically
    if (suffixA && suffixB) {
      return suffixB.localeCompare(suffixA); // Descending order
    }
    
    // No suffix is "greater than" having a suffix (stable release vs pre-release)
    if (!suffixA && suffixB) return 1;
    if (suffixA && !suffixB) return -1;
  }
  
  // If all parts are equal, versions are considered equal
  return 0;
};

// Extract GitHub blog style entries
const extractGitHubEntries = (markdownContent: string): Record<string, { description: string; detailLink?: string }> => {
  console.log("DEBUG: --- Extracting GitHub Blog Style Entries ---");
  const entries: Record<string, { description: string; detailLink?: string }> = {};
  
  // Find all GitHub blog style headings
  const allHeadings: Array<{ title: string, link: string, index: number }> = [];
  const headingRegex = /##\s+\[([^\]]+)\]\(([^)]+)\)/g;
  let headingMatch;
  
  while ((headingMatch = headingRegex.exec(markdownContent)) !== null) {
    allHeadings.push({
      title: headingMatch[1],
      link: headingMatch[2],
      index: headingMatch.index
    });
  }
  
  console.log(`DEBUG: Found ${allHeadings.length} GitHub-style headings`);
  
  // If we have multiple headings, process each section
  if (allHeadings.length >= 2) {
    for (let i = 0; i < allHeadings.length; i++) {
      const currentHeading = allHeadings[i];
      const nextHeading = allHeadings[i + 1];
      
      // Extract content between current heading and next heading (or end of document)
      const startIndex = markdownContent.indexOf('\n', currentHeading.index);
      const endIndex = nextHeading ? nextHeading.index : markdownContent.length;
      
      if (startIndex > 0 && endIndex > startIndex) {
        let content = markdownContent.substring(startIndex, endIndex).trim();
        
        // Extract date if present
        const dateMatch = content.match(/^[A-Za-z]+\s+\d{1,2},\s*\d{4}/);
        
        // Clean the content - remove date line and category lines if present
        if (dateMatch) {
          content = content.substring(dateMatch[0].length).trim();
        }
        
        // Remove category tags if present (lines starting with - [tag])
        content = content.replace(/^-\s*\[[^\]]+\](?:\([^)]+\))?\s*$/gm, '').trim();
        
        // Clean and process the content
        const cleanedContent = cleanDescriptionBlock(content);
        
        if (cleanedContent && cleanedContent.length > 5) {
          // Find "See more" links using regex.exec instead of matchAll for better compatibility
          let seeMoreRegex = /\[See more\]\(([^)]+)\)/g;
          let seeMoreMatch;
          let lastSeeMoreLink = null;
          
          // Find the last occurrence of "See more" link
          while ((seeMoreMatch = seeMoreRegex.exec(content)) !== null) {
            if (seeMoreMatch && seeMoreMatch[1]) {
              lastSeeMoreLink = seeMoreMatch[1];
            }
          }
          
          // Use the last "See more" link if found
          let detailLink = currentHeading.link; // Default to the heading link
          if (lastSeeMoreLink) {
            detailLink = lastSeeMoreLink;
          }
          
          entries[currentHeading.title] = {
            description: cleanedContent,
            detailLink: detailLink
          };
          
          console.log(`DEBUG: Added GitHub blog entry: ${currentHeading.title} ${dateMatch ? '(' + dateMatch[0] + ')' : ''}`);
        }
      }
    }
  } else {
    // Fallback to the previous regex-based approach if we don't have multiple headings
    console.log("DEBUG: Few GitHub headings found, trying regex approach...");
    
    // First pattern: More flexible GitHub blog style matching
    const githubPattern = new RegExp(
      '##\\s+\\[([^\\]]+)\\]\\(([^)]+)\\)\\s*(?:\\n+|$)' +  // Title and link with flexible spacing
      '(?:([A-Za-z]+\\s+\\d{1,2},\\s*\\d{4})\\s*(?:\\n+|$))?' +  // Optional date
      '(?:(?:-\\s*\\[[^\\]]+\\](?:\\([^)]+\\))?\\s*(?:\\n+|$))*)?' +  // Optional categories
      '([\\s\\S]*?)(?=\\n+##\\s+|\\n*$)',  // Content until next heading or end
      'g'
    );
    
    // Test with the first pattern
    let match;
    let matchCount = 0;
    
    while ((match = githubPattern.exec(markdownContent)) !== null) {
      const [fullMatch, title, link, date, content] = match;
      
      // Clean the content
      const cleanedContent = cleanDescriptionBlock(content);
      
      if (cleanedContent && cleanedContent.length > 5) {
        // Find "See more" links using regex.exec instead of matchAll for better compatibility
        let seeMoreRegex = /\[See more\]\(([^)]+)\)/g;
        let seeMoreMatch;
        let lastSeeMoreLink = null;
        
        // Find the last occurrence of "See more" link
        while ((seeMoreMatch = seeMoreRegex.exec(content)) !== null) {
          if (seeMoreMatch && seeMoreMatch[1]) {
            lastSeeMoreLink = seeMoreMatch[1];
          }
        }
        
        // Use the last "See more" link if found
        let detailLink = link; // Default to the heading link
        if (lastSeeMoreLink) {
          detailLink = lastSeeMoreLink;
        }
        
        entries[title] = {
          description: cleanedContent,
          detailLink: detailLink
        };
        
        console.log(`DEBUG: Added GitHub blog entry: ${title} ${date ? '(' + date + ')' : ''}`);
        matchCount++;
      }
    }
    
    console.log(`DEBUG: GitHub pattern found ${matchCount} entries`);
    
    // If few entries found, try line-by-line fallback
    if (matchCount < 2) {
      console.log("DEBUG: GitHub patterns found few entries, trying line-by-line fallback");
      
      const headingRegex = /^##\s+\[([^\]]+)\]\(([^)]+)\)$/;
      const lines = markdownContent.split('\n');
      let currentEntry: { title: string; link: string; content: string[] } | null = null;
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        // Look for GitHub style headers: ## [Title](link)
        const headerMatch = line.match(headingRegex);
        
        if (headerMatch) {
          // Save previous entry if it exists
          if (currentEntry && currentEntry.content.length > 0) {
            const content = currentEntry.content.join('\n');
            const cleanedContent = cleanDescriptionBlock(content);
            
            if (cleanedContent && cleanedContent.length > 5 && !entries[currentEntry.title]) {
              entries[currentEntry.title] = {
                description: cleanedContent,
                detailLink: currentEntry.link
              };
              
              console.log(`DEBUG: Added GitHub blog entry (fallback): ${currentEntry.title}`);
            }
          }
          
          // Start new entry
          currentEntry = {
            title: headerMatch[1],
            link: headerMatch[2],
            content: []
          };
        } else if (currentEntry) {
          // Add to current entry
          currentEntry.content.push(line);
          
          // Check for "See more" link to update detail link
          const seeMoreMatch = line.match(/\[See more\]\(([^)]+)\)/);
          if (seeMoreMatch && seeMoreMatch[1]) {
            currentEntry.link = seeMoreMatch[1];
          }
        }
      }
      
      // Don't forget to process the last entry
      if (currentEntry && currentEntry.content.length > 0 && !entries[currentEntry.title]) {
        const content = currentEntry.content.join('\n');
        const cleanedContent = cleanDescriptionBlock(content);
        
        if (cleanedContent && cleanedContent.length > 5) {
          entries[currentEntry.title] = {
            description: cleanedContent,
            detailLink: currentEntry.link
          };
          
          console.log(`DEBUG: Added final GitHub blog entry (fallback): ${currentEntry.title}`);
        }
      }
    }
  }
  
  console.log(`DEBUG: Found ${Object.keys(entries).length} GitHub blog style entries total`);
  console.log("DEBUG: --- Finished GitHub Blog Extraction ---");
  
  return entries;
};

// Extract GitHub Releases-style entries (different from GitHub Blog)
const extractGitHubReleases = (markdownContent: string): Record<string, { description: string; detailLink?: string }> => {
  console.log("DEBUG: --- Extracting GitHub Releases Style Entries ---");
  const entries: Record<string, { description: string; detailLink?: string }> = {};
  
  // Look for version headers in GitHub releases format
  // Example: # v1.2.3
  const releaseHeaderPattern = /^#+\s+v?(\d+\.\d+(\.\d+)?(-[a-zA-Z0-9_.-]+)?)/gm;
  let match;
  
  while ((match = releaseHeaderPattern.exec(markdownContent)) !== null) {
    const version = match[1];
    const headerLine = match[0];
    const startIndex = match.index + headerLine.length;
    
    // Find the next header or end of content
    const nextHeaderMatch = releaseHeaderPattern.exec(markdownContent);
    releaseHeaderPattern.lastIndex = match.index + 1; // Reset to continue from after current match
    
    const endIndex = nextHeaderMatch ? nextHeaderMatch.index : markdownContent.length;
    
    // Extract content between headers
    let content = markdownContent.substring(startIndex, endIndex).trim();
    
    // Skip if there's no meaningful content
    if (content.length < 5) continue;
    
    // Clean up the content
    const cleanedContent = cleanDescriptionBlock(content);
    
    // Look for a link to the release
    let detailLink;
    // Try to find a link to the GitHub release
    const releaseUrlMatch = content.match(/https:\/\/github\.com\/[^\/]+\/[^\/]+\/(?:releases|tags|compare)\/[^)\s]+/);
    if (releaseUrlMatch) {
      detailLink = releaseUrlMatch[0];
    }
    
    if (cleanedContent && cleanedContent.length > 5) {
      entries[version] = {
        description: cleanedContent,
        detailLink
      };
      
      console.log(`DEBUG: Added GitHub release entry: ${version}`);
    }
  }
  
  console.log(`DEBUG: Found ${Object.keys(entries).length} GitHub release style entries`);
  console.log("DEBUG: --- Finished GitHub Releases Extraction ---");
  
  return entries;
};

// Extract IDE style changelogs (JetBrains, VS Code)
const extractIDEChangelog = (markdownContent: string): Record<string, { description: string; detailLink?: string }> => {
  console.log("DEBUG: --- Extracting IDE Style Changelog Entries ---");
  const entries: Record<string, { description: string; detailLink?: string }> = {};
  
  // Patterns for different IDE version formats
  const patterns = [
    // JetBrains style: ## What's New in IntelliJ IDEA 2023.1
    /^#+\s+(?:What'?s New|New Features|Updates?)(?:\s+in)?\s+(?:[a-z0-9\s]+\s+)?(?:v\.?)?([0-9]{4}\.[0-9](?:\.[0-9])?)/im,
    
    // VS Code style: # March 2023 (version 1.77)
    /^#+\s+(?:[a-zA-Z]+\s+[0-9]{4})\s+\(version\s+([0-9]+\.[0-9]+(?:\.[0-9]+)?)\)/im,
    
    // VS Code alternative style: # v1.77
    /^#+\s+v([0-9]+\.[0-9]+(?:\.[0-9]+)?)/im,
    
    // Generic version header: ## Version 2023.1
    /^#+\s+(?:Version|Release)\s+([0-9]{4}\.[0-9](?:\.[0-9])?|\d+\.\d+\.\d+)/im
  ];
  
  // Process the content line by line to identify version blocks
  const lines = markdownContent.split('\n');
  let currentVersion: string | null = null;
  let currentVersionLine = '';
  let contentBuffer: string[] = [];
  let sectionLevel = 0;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Check if the line is a version header
    let isVersionHeader = false;
    let versionMatch = null;
    
    for (const pattern of patterns) {
      versionMatch = line.match(pattern);
      if (versionMatch) {
        // If we were already processing a version block, save it
        if (currentVersion && contentBuffer.length > 0) {
          const content = contentBuffer.join('\n');
          const cleanedContent = cleanDescriptionBlock(content);
          
          // Extract a potential link
          let detailLink;
          const linkMatch = content.match(/https?:\/\/[^\s)]+(?:docs|updates|whatsnew|releases)[^\s)]*/);
          if (linkMatch) {
            detailLink = linkMatch[0];
          }
          
          if (cleanedContent && cleanedContent.length > 5) {
            entries[currentVersion] = { 
              description: cleanedContent,
              detailLink
            };
            console.log(`DEBUG: Added IDE changelog entry: ${currentVersion}`);
          }
        }
        
        // Start a new version block
        currentVersion = versionMatch[1];
        currentVersionLine = line;
        contentBuffer = [];
        sectionLevel = (line.match(/^#+/) || ['#'])[0].length;
        isVersionHeader = true;
        break;
      }
    }
    
    // If not a version header and we're in a version block, add to content
    if (!isVersionHeader && currentVersion) {
      // Check if this line starts a new section at the same level, which would end our version block
      if (line.startsWith('#') && line.match(/^#+/)[0].length <= sectionLevel) {
        // Process the completed version block
        const content = contentBuffer.join('\n');
        const cleanedContent = cleanDescriptionBlock(content);
        
        // Extract a potential link
        let detailLink;
        const linkMatch = content.match(/https?:\/\/[^\s)]+(?:docs|updates|whatsnew|releases)[^\s)]*/);
        if (linkMatch) {
          detailLink = linkMatch[0];
        }
        
        if (cleanedContent && cleanedContent.length > 5) {
          entries[currentVersion] = { 
            description: cleanedContent,
            detailLink
          };
          console.log(`DEBUG: Added IDE changelog entry: ${currentVersion}`);
        }
        
        // Reset for next block
        currentVersion = null;
        contentBuffer = [];
      } else {
        // Add the line to the current content buffer
        contentBuffer.push(line);
      }
    }
  }
  
  // Don't forget to process the last version block
  if (currentVersion && contentBuffer.length > 0) {
    const content = contentBuffer.join('\n');
    const cleanedContent = cleanDescriptionBlock(content);
    
    // Extract a potential link
    let detailLink;
    const linkMatch = content.match(/https?:\/\/[^\s)]+(?:docs|updates|whatsnew|releases)[^\s)]*/);
    if (linkMatch) {
      detailLink = linkMatch[0];
    }
    
    if (cleanedContent && cleanedContent.length > 5) {
      entries[currentVersion] = { 
        description: cleanedContent,
        detailLink
      };
      console.log(`DEBUG: Added final IDE changelog entry: ${currentVersion}`);
    }
  }
  
  console.log(`DEBUG: Found ${Object.keys(entries).length} IDE style changelog entries`);
  console.log("DEBUG: --- Finished IDE Changelog Extraction ---");
  
  return entries;
};