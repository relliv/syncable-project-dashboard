import * as vscode from 'vscode';
import { ConfigManager, ProjectConfig, ProjectInfo } from './configManager';
import * as path from 'path';
import * as fs from 'fs';

export class ProjectDashboard {
    private panel: vscode.WebviewPanel | undefined;
    private configManager: ConfigManager;
    private context: vscode.ExtensionContext;

    constructor(configManager: ConfigManager, context: vscode.ExtensionContext) {
        this.configManager = configManager;
        this.context = context;
    }

    /**
     * Open the dashboard panel
     */
    public async open(): Promise<void> {
        // If we already have a panel, show it
        if (this.panel) {
            this.panel.reveal(vscode.ViewColumn.One);
            return;
        }

        // Create a new panel
        this.panel = vscode.window.createWebviewPanel(
            'projectDashboard',
            '📌 Project Dashboard',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        // Handle panel disposal
        this.panel.onDidDispose(() => {
            this.panel = undefined;
        }, null, this.context.subscriptions);

        // Handle messages from the webview
        this.panel.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.command) {
                    case 'selectBaseFolder':
                        await this.handleSelectBaseFolder();
                        break;
                    case 'openProject':
                        await this.handleOpenProject(message.projectPath);
                        break;
                    case 'rescanProjects':
                        await this.rescanProjects();
                        break;
                    case 'refreshGroup':
                        await this.refreshGroup(message.groupName);
                        break;
                    case 'sortProjects':
                        await this.sortProjects(message.sortBy);
                        break;
                    case 'toggleGroup':
                        await this.handleToggleGroup(message.groupName, message.expanded);
                        break;
                    case 'exportConfig':
                        await this.handleExportConfig();
                        break;
                    case 'importConfig':
                        await this.handleImportConfig();
                        break;
                }
            },
            undefined,
            this.context.subscriptions
        );

        // Load projects and update the webview
        await this.updateWebview();
    }

    /**
     * Update the webview content
     */
    private async updateWebview(): Promise<void> {
        if (!this.panel) {
            return;
        }

        let config = this.configManager.getConfig();
        
        // If no base folder is set, try to get one from the user
        if (!config.baseProjectsFolder) {
            await this.handleSelectBaseFolder();
            config = this.configManager.getConfig();
            
            // If user cancelled, show empty state
            if (!config.baseProjectsFolder) {
                this.panel.webview.html = this.getNoFolderHtml();
                return;
            }
        }

        // If no projects data or it's older than a day, scan projects
        if (!config.projectsData || !config.lastScanTime || 
            (Date.now() - config.lastScanTime > 24 * 60 * 60 * 1000)) {
            try {
                config = await this.configManager.scanProjects();
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to scan projects: ${error}`);
                this.panel.webview.html = this.getErrorHtml(error);
                return;
            }
        }

        // Render the dashboard
        this.panel.webview.html = this.getDashboardHtml(config);
    }

    /**
     * Handle selecting the base folder
     */
    private async handleSelectBaseFolder(): Promise<void> {
        try {
            const folderPath = await this.configManager.setBaseProjectsFolder();
            if (folderPath) {
                await this.configManager.scanProjects();
                await this.updateWebview();
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to set base folder: ${error}`);
        }
    }

    /**
     * Rescan projects and update the webview
     */
    private async rescanProjects(): Promise<void> {
        try {
            await this.configManager.scanProjects();
            await this.updateWebview();
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to scan projects: ${error}`);
        }
    }

    /**
     * Refresh a specific group
     */
    private async refreshGroup(groupName: string): Promise<void> {
        try {
            const config = this.configManager.getConfig();
            if (!config.baseProjectsFolder) {
                throw new Error('Base projects folder not set');
            }

            // Ensure the group folder exists
            const groupPath = path.join(config.baseProjectsFolder, groupName);
            if (!fs.existsSync(groupPath)) {
                throw new Error(`Group folder does not exist: ${groupName}`);
            }

            // Scan the group's projects
            const projectFolders = fs.readdirSync(groupPath, { withFileTypes: true })
                .filter(dirent => dirent.isDirectory())
                .map(dirent => dirent.name);

            const projectInfoList: ProjectInfo[] = [];
            
            for (const projectName of projectFolders) {
                const projectPath = path.join(groupPath, projectName);
                const color = this.configManager.getProjectColor(projectPath);
                
                projectInfoList.push({
                    name: projectName,
                    color: color
                });
            }

            // Update the config
            if (!config.projectsData) {
                config.projectsData = {};
            }
            config.projectsData[groupName] = projectInfoList;
            await this.configManager.saveConfig(config);

            // Update the webview
            await this.updateWebview();
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to refresh group: ${error}`);
        }
    }

    /**
     * Sort projects by different criteria
     */
    private async sortProjects(sortBy: string): Promise<void> {
        try {
            const config = this.configManager.getConfig();
            if (!config.projectsData) {
                return;
            }

            // Sort groups if needed
            if (sortBy.includes('group')) {
                // Create a sorted copy of the groups
                const sortedGroups = Object.keys(config.projectsData).sort();
                
                // If descending order is requested, reverse the array
                if (sortBy === 'group-desc') {
                    sortedGroups.reverse();
                }
                
                // Create a new sorted projectsData object
                const sortedProjectsData: { [groupName: string]: ProjectInfo[] } = {};
                for (const groupName of sortedGroups) {
                    sortedProjectsData[groupName] = config.projectsData[groupName];
                }
                
                // Replace the original with the sorted version
                config.projectsData = sortedProjectsData;
            } else {
                // For each group, sort the projects
                for (const groupName of Object.keys(config.projectsData)) {
                    const projects = config.projectsData[groupName];
                    if (!projects) {
                        continue;
                    }

                    switch (sortBy) {
                        case 'name-asc':
                            projects.sort((a, b) => a.name.localeCompare(b.name));
                            break;
                        case 'name-desc':
                            projects.sort((a, b) => b.name.localeCompare(a.name));
                            break;
                    }
                }
            }

            // Save the sorted projects
            await this.configManager.saveConfig(config);
            
            // Update the webview
            await this.updateWebview();
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to sort projects: ${error}`);
        }
    }

    /**
     * Handle opening a project
     */
    private async handleOpenProject(projectPath: string): Promise<void> {
        const config = this.configManager.getConfig();
        if (!config.baseProjectsFolder) {
            return;
        }

        const [groupName, projectName] = projectPath.split('/');
        const fullPath = path.join(config.baseProjectsFolder, groupName, projectName);
        
        // Open the project in a new window
        await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(fullPath), { forceNewWindow: true });
    }

    /**
     * Handle toggling a group's expanded/collapsed state
     */
    private async handleToggleGroup(groupName: string, expanded: boolean): Promise<void> {
        try {
            // Get current config
            const config = this.configManager.getConfig();
            
            // Initialize groupStates if it doesn't exist
            if (!config.groupStates) {
                config.groupStates = {};
            }
            
            // Save the new state
            config.groupStates[groupName] = expanded;
            
            // Save config
            await this.configManager.saveConfig(config);

            // No need to update webview here, as the state is already updated in the UI
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to toggle group: ${error}`);
        }
    }

    /**
     * Get saved group expanded states
     */
    private getGroupStates(): { [groupName: string]: boolean } {
        const config = this.configManager.getConfig();
        return config.groupStates || {};
    }

    /**
     * Get HTML for no folder selected state
     */
    private getNoFolderHtml(): string {
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>📌 Project Dashboard</title>
            <style>
                body {
                    font-family: var(--vscode-font-family);
                    padding: 20px;
                    color: var(--vscode-foreground);
                    background-color: var(--vscode-editor-background);
                }
                .container {
                    max-width: 800px;
                    margin: 0 auto;
                    text-align: center;
                    padding: 40px 20px;
                }
                button {
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    padding: 8px 16px;
                    cursor: pointer;
                    border-radius: 2px;
                    font-size: 14px;
                    margin-top: 20px;
                }
                button:hover {
                    background-color: var(--vscode-button-hoverBackground);
                }
                h1 {
                    color: var(--vscode-editor-foreground);
                    font-size: 24px;
                    margin-bottom: 20px;
                }
                p {
                    margin-bottom: 20px;
                    line-height: 1.5;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>Welcome to Project Dashboard</h1>
                <p>Please select a base folder where your projects are stored.</p>
                <p>The dashboard will scan the folder and display your projects organized by groups.</p>
                <button id="selectFolder">Select Base Folder</button>
            </div>
            <script>
                const vscode = acquireVsCodeApi();
                document.getElementById('selectFolder').addEventListener('click', () => {
                    vscode.postMessage({
                        command: 'selectBaseFolder'
                    });
                });
            </script>
        </body>
        </html>`;
    }

    /**
     * Get HTML for error state
     */
    private getErrorHtml(error: any): string {
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>📌 Project Dashboard</title>
            <style>
                body {
                    font-family: var(--vscode-font-family);
                    padding: 20px;
                    color: var(--vscode-foreground);
                    background-color: var(--vscode-editor-background);
                }
                .container {
                    max-width: 800px;
                    margin: 0 auto;
                    text-align: center;
                    padding: 40px 20px;
                }
                .error {
                    color: var(--vscode-errorForeground);
                    margin-bottom: 20px;
                    padding: 10px;
                    background-color: var(--vscode-inputValidation-errorBackground);
                    border: 1px solid var(--vscode-inputValidation-errorBorder);
                    border-radius: 3px;
                }
                button {
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    padding: 8px 16px;
                    cursor: pointer;
                    border-radius: 2px;
                    font-size: 14px;
                    margin-top: 20px;
                }
                button:hover {
                    background-color: var(--vscode-button-hoverBackground);
                }
                h1 {
                    color: var(--vscode-editor-foreground);
                    font-size: 24px;
                    margin-bottom: 20px;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>Error</h1>
                <div class="error">${error}</div>
                <button id="selectFolder">Change Base Folder</button>
                <button id="rescan">Try Again</button>
            </div>
            <script>
                const vscode = acquireVsCodeApi();
                document.getElementById('selectFolder').addEventListener('click', () => {
                    vscode.postMessage({
                        command: 'selectBaseFolder'
                    });
                });
                document.getElementById('rescan').addEventListener('click', () => {
                    vscode.postMessage({
                        command: 'rescanProjects'
                    });
                });
            </script>
        </body>
        </html>`;
    }

    /**
     * Get HTML for the dashboard
     */
    private getDashboardHtml(config: ProjectConfig): string {
        if (!config.baseProjectsFolder || !config.projectsData) {
            return this.getNoFolderHtml();
        }

        // Prepare groups and projects for rendering
        const groups = Object.keys(config.projectsData);
        let groupsHtml = '';

        // Get saved group states
        const savedGroupStates = this.getGroupStates();

        for (const groupName of groups) {
            const projects = config.projectsData[groupName];
            let projectsHtml = '';

            for (const project of projects) {
                // Apply custom color if available, otherwise use default
                const customStyle = project.color 
                    ? `style="background-color: ${project.color};"` 
                    : '';
                
                // Add a small indicator if the project has a custom color
                const colorIndicator = project.color 
                    ? `<div class="color-indicator" title="This project has a custom theme color"></div>` 
                    : '';
                
                projectsHtml += `
                    <div class="project" data-path="${groupName}/${project.name}">
                        <div class="project-inner" ${customStyle}>
                            ${colorIndicator}
                            <div class="project-name">${project.name}</div>
                        </div>
                    </div>
                `;
            }

            // Check if the group is expanded or collapsed
            const isExpanded = savedGroupStates[groupName] === true; // Default to collapsed
            
            // Get the project count for this group
            const projectCount = projects.length;

            groupsHtml += `
                <div class="group ${isExpanded ? '' : 'collapsed'}">
                    <div class="group-header">
                        <div class="group-name">
                            ${groupName}
                            <span class="project-count" title="${projectCount} projects">${projectCount}</span>
                        </div>
                        <div class="group-actions">
                            <button class="group-refresh" data-group="${groupName}" title="Refresh this group">↻</button>
                            <div class="group-toggle" title="Collapse/Expand Group">▼</div>
                        </div>
                    </div>
                    <div class="group-projects">
                        ${projectsHtml}
                    </div>
                </div>
            `;
        }

        // Format the last scan time
        const lastScanTime = config.lastScanTime 
            ? new Date(config.lastScanTime).toLocaleString() 
            : 'Never';

        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>📌 Project Dashboard</title>
            <style>
                body {
                    font-family: var(--vscode-font-family);
                    padding: 20px;
                    color: var(--vscode-foreground);
                    background-color: var(--vscode-editor-background);
                }
                .container {
                    max-width: 1200px;
                    margin: 0 auto;
                }
                .header {
                    display: flex;
                    flex-direction: row;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 20px;
                    padding-bottom: 10px;
                    border-bottom: 1px solid var(--vscode-panel-border);
                    flex-wrap: wrap;
                    gap: 15px;
                }
                .controls {
                    display: flex;
                    gap: 10px;
                    align-items: center;
                    flex-wrap: wrap;
                }
                .search-container {
                    position: relative;
                }
                #searchInput {
                    padding: 6px 10px;
                    border-radius: 3px;
                    border: 1px solid var(--vscode-input-border);
                    background-color: var(--vscode-input-background);
                    color: var(--vscode-input-foreground);
                    font-size: 12px;
                    width: 200px;
                }
                #searchInput:focus {
                    outline: 1px solid var(--vscode-focusBorder);
                }
                .sort-container {
                    position: relative;
                }
                #sortSelect {
                    padding: 6px 10px;
                    border-radius: 3px;
                    border: 1px solid var(--vscode-dropdown-border);
                    background-color: var(--vscode-dropdown-background);
                    color: var(--vscode-dropdown-foreground);
                    font-size: 12px;
                    appearance: none;
                    padding-right: 20px;
                }
                .sort-container::after {
                    content: '▼';
                    font-size: 8px;
                    position: absolute;
                    right: 8px;
                    top: 50%;
                    transform: translateY(-50%);
                    pointer-events: none;
                }
                
                .button-container {
                    display: flex;
                    gap: 10px;
                }
                button {
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    padding: 6px 12px;
                    cursor: pointer;
                    border-radius: 2px;
                    font-size: 12px;
                    white-space: nowrap;
                }
                button:hover {
                    background-color: var(--vscode-button-hoverBackground);
                }
                
                @media (max-width: 480px) {
                    button {
                        width: 100%;
                        margin-top: 5px;
                    }
                }
                .group {
                    margin-bottom: 20px;
                    border-radius: 3px;
                    overflow: hidden;
                    background-color: var(--vscode-editor-background);
                    border: 1px solid var(--vscode-panel-border);
                }
                .group-header {
                    display: flex;
                    justify-content: space-between;
                    padding: 8px 12px;
                    background-color: var(--vscode-sideBarSectionHeader-background);
                    cursor: pointer;
                    user-select: none;
                    align-items: center;
                }
                .group-name {
                    font-weight: bold;
                    padding: 4px 0;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }
                .project-count {
                    background-color: var(--vscode-badge-background);
                    color: var(--vscode-badge-foreground);
                    border-radius: 10px;
                    font-size: 0.5em;
                    padding: 4px 6px;
                    font-weight: normal;
                    display: inline-block;
                }
                .group-actions {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    flex-shrink: 0;
                    height: 24px;
                }
                .group-toggle {
                    transition: transform 0.2s;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    width: 16px;
                    height: 16px;
                    line-height: 1;
                }
                .group-toggle:hover {
                    opacity: 1;
                    color: var(--vscode-button-foreground);
                }
                .group-refresh {
                    background: none;
                    border: none;
                    color: var(--vscode-foreground);
                    cursor: pointer;
                    font-size: 14px;
                    padding: 0;
                    width: 24px;
                    height: 24px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border-radius: 3px;
                    opacity: 0.6;
                    line-height: 1;
                }
                .group-refresh:hover {
                    background-color: var(--vscode-button-hoverBackground);
                    opacity: 1;
                }
                .group-projects {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
                    gap: 15px;
                    padding: 15px;
                }
                .group.collapsed .group-projects {
                    display: none;
                }
                .group.collapsed .group-toggle {
                    transform: rotate(-90deg);
                }
                .project {
                    border-radius: 5px;
                    overflow: hidden;
                    cursor: pointer;
                    transition: transform 0.1s, box-shadow 0.1s;
                    border: 2px solid transparent;
                }
                .project-inner {
                    height: 50px;
                    display: flex;
                    flex-direction: column;
                    justify-content: center;
                    align-items: center;
                    padding: 5px 15px;
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    text-align: center;
                    position: relative;
                }
                .project-inner[style*="background-color"] {
                    color: #ffffff;
                    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
                }
                .project:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
                    border-color: var(--vscode-focusBorder);
                }
                .project-name {
                    word-break: break-word;
                }
                .color-indicator {
                    position: absolute;
                    top: 5px;
                    right: 5px;
                    width: 8px;
                    height: 8px;
                    border-radius: 50%;
                    background-color: #ffffff;
                    border: 1px solid rgba(0, 0, 0, 0.2);
                    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
                }
                .info {
                    margin-top: 20px;
                    font-size: 12px;
                    color: var(--vscode-descriptionForeground);
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    flex-wrap: wrap;
                    gap: 10px;
                    padding-top: 10px;
                    border-top: 1px solid var(--vscode-panel-border);
                }
                
                .info-details {
                    display: flex;
                    flex-direction: column;
                    gap: 5px;
                }
                
                .info-actions {
                    display: flex;
                    gap: 10px;
                }
                
                .secondary-button {
                    background-color: var(--vscode-button-secondaryBackground, var(--vscode-editor-background));
                    color: var(--vscode-button-secondaryForeground, var(--vscode-editor-foreground));
                    border: 1px solid var(--vscode-button-border, var(--vscode-panel-border));
                    font-size: 11px;
                    padding: 4px 8px;
                }
                
                .secondary-button:hover {
                    background-color: var(--vscode-button-secondaryHoverBackground, var(--vscode-list-hoverBackground));
                }
                
                h1 {
                    color: var(--vscode-editor-foreground);
                    font-size: 24px;
                    margin: 0;
                }
                .group-actions > * {
                    cursor: pointer;
                }
                
                /* Responsive styles */
                @media (max-width: 768px) {
                    .header {
                        flex-direction: column;
                        align-items: flex-start;
                    }
                    
                    .controls {
                        width: 100%;
                        justify-content: space-between;
                    }
                    
                    #searchInput {
                        width: 100%;
                        min-width: 150px;
                    }
                }
                
                @media (max-width: 480px) {
                    .controls {
                        flex-direction: column;
                        align-items: stretch;
                    }
                    
                    .search-container, .sort-container, .button-container {
                        width: 100%;
                    }
                    
                    .button-container {
                        display: flex;
                        flex-direction: column;
                        gap: 5px;
                    }
                    
                    #sortSelect {
                        width: 100%;
                    }
                    
                    .container {
                        padding: 10px;
                    }
                    
                    .info {
                        flex-direction: column;
                        align-items: flex-start;
                    }
                    
                    .info-actions {
                        width: 100%;
                        justify-content: space-between;
                    }
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>📌 Project Dashboard</h1>
                    <div class="controls">
                        <div class="search-container">
                            <input type="text" id="searchInput" placeholder="Search projects...">
                        </div>
                        <div class="sort-container">
                            <select id="sortSelect">
                                <option value="group-asc">Groups (A-Z)</option>
                                <option value="group-desc">Groups (Z-A)</option>
                                <option value="name-asc">Projects (A-Z)</option>
                                <option value="name-desc">Projects (Z-A)</option>
                            </select>
                        </div>
                        <div class="button-container">
                            <button id="rescan">Rescan Projects</button>
                            <button id="changeFolder">Change Base Folder</button>
                        </div>
                    </div>
                </div>
                <div class="groups">
                    ${groupsHtml}
                </div>
                <div class="info">
                    <div class="info-details">
                        <div>Base Folder: ${config.baseProjectsFolder}</div>
                        <div>Last Scan: ${lastScanTime}</div>
                    </div>
                    <div class="info-actions">
                        <button id="exportConfig" class="secondary-button">Export Config</button>
                        <button id="importConfig" class="secondary-button">Import Config</button>
                    </div>
                </div>
            </div>
            <script>
                const vscode = acquireVsCodeApi();
                
                // Toggle group collapse
                document.querySelectorAll('.group-header').forEach(header => {
                    header.addEventListener('click', (e) => {
                        // Don't toggle if clicking on the refresh button
                        if (e.target.closest('.group-refresh')) {
                            return;
                        }
                        
                        const group = header.parentElement;
                        group.classList.toggle('collapsed');
                        
                        // Get group name (without the count badge)
                        const groupNameElement = header.querySelector('.group-name');
                        const groupNameText = groupNameElement.childNodes[0].nodeValue.trim();
                        
                        // Save the new state
                        const isExpanded = !group.classList.contains('collapsed');
                        vscode.postMessage({
                            command: 'toggleGroup',
                            groupName: groupNameText,
                            expanded: isExpanded
                        });
                    });
                });
                
                // Refresh individual group
                document.querySelectorAll('.group-refresh').forEach(button => {
                    button.addEventListener('click', (e) => {
                        e.stopPropagation(); // Prevent group toggle
                        const groupName = button.getAttribute('data-group');
                        vscode.postMessage({
                            command: 'refreshGroup',
                            groupName: groupName
                        });
                    });
                });
                
                // Open project
                document.querySelectorAll('.project').forEach(project => {
                    project.addEventListener('click', () => {
                        const projectPath = project.getAttribute('data-path');
                        vscode.postMessage({
                            command: 'openProject',
                            projectPath: projectPath
                        });
                    });
                });
                
                // Rescan projects
                document.getElementById('rescan').addEventListener('click', () => {
                    vscode.postMessage({
                        command: 'rescanProjects'
                    });
                });
                
                // Change base folder
                document.getElementById('changeFolder').addEventListener('click', () => {
                    vscode.postMessage({
                        command: 'selectBaseFolder'
                    });
                });
                
                // Export configuration
                document.getElementById('exportConfig').addEventListener('click', () => {
                    vscode.postMessage({
                        command: 'exportConfig'
                    });
                });
                
                // Import configuration
                document.getElementById('importConfig').addEventListener('click', () => {
                    vscode.postMessage({
                        command: 'importConfig'
                    });
                });
                
                // Sort projects
                document.getElementById('sortSelect').addEventListener('change', (e) => {
                    vscode.postMessage({
                        command: 'sortProjects',
                        sortBy: e.target.value
                    });
                });
                
                // Search/filter projects
                document.getElementById('searchInput').addEventListener('input', (e) => {
                    const searchTerm = e.target.value.toLowerCase();
                    document.querySelectorAll('.project').forEach(project => {
                        const projectName = project.querySelector('.project-name').textContent.toLowerCase();
                        const isVisible = projectName.includes(searchTerm);
                        project.style.display = isVisible ? '' : 'none';
                    });
                    
                    // Show/hide groups based on whether they have any visible projects
                    document.querySelectorAll('.group').forEach(group => {
                        const visibleProjects = Array.from(group.querySelectorAll('.project'))
                            .filter(project => project.style.display !== 'none');
                        const hasVisibleProjects = visibleProjects.length > 0;
                        group.style.display = hasVisibleProjects ? '' : 'none';
                        
                        // Update the project count badge to show only visible projects
                        if (hasVisibleProjects) {
                            const projectCount = group.querySelector('.project-count');
                            if (projectCount) {
                                const totalCount = group.querySelectorAll('.project').length;
                                const visibleCount = visibleProjects.length;
                                
                                if (visibleCount < totalCount) {
                                    projectCount.textContent = visibleCount + '/' + totalCount;
                                    projectCount.title = visibleCount + ' matching out of ' + totalCount + ' total projects';
                                } else {
                                    projectCount.textContent = totalCount;
                                    projectCount.title = totalCount + ' projects';
                                }
                            }
                        }
                    });
                });
            </script>
        </body>
        </html>`;
    }

    /**
     * Handle exporting the configuration
     */
    private async handleExportConfig(): Promise<void> {
        try {
            const config = this.configManager.getConfig();
            
            // Create a file save dialog
            const saveUri = await vscode.window.showSaveDialog({
                defaultUri: vscode.Uri.file('project-dashboard-config.json'),
                filters: {
                    'JSON Files': ['json']
                },
                title: 'Export Project Dashboard Configuration'
            });
            
            if (saveUri) {
                // Prepare the config for export (remove sensitive data if needed)
                const exportConfig = {
                    baseProjectsFolder: config.baseProjectsFolder,
                    projectsData: config.projectsData,
                    groupStates: config.groupStates,
                    lastScanTime: config.lastScanTime
                };
                
                // Convert to pretty JSON
                const jsonContent = JSON.stringify(exportConfig, null, 2);
                
                // Write to file
                await vscode.workspace.fs.writeFile(saveUri, Buffer.from(jsonContent, 'utf8'));
                
                vscode.window.showInformationMessage('Configuration exported successfully!');
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to export configuration: ${error}`);
        }
    }

    /**
     * Handle importing configuration
     */
    private async handleImportConfig(): Promise<void> {
        try {
            // Create a file open dialog
            const openUri = await vscode.window.showOpenDialog({
                canSelectFiles: true,
                canSelectFolders: false,
                canSelectMany: false,
                filters: {
                    'JSON Files': ['json']
                },
                title: 'Import Project Dashboard Configuration'
            });
            
            if (openUri && openUri.length > 0) {
                // Read the file
                const fileData = await vscode.workspace.fs.readFile(openUri[0]);
                const jsonContent = Buffer.from(fileData).toString('utf8');
                
                // Parse the JSON
                const importedConfig = JSON.parse(jsonContent);
                
                // Validate the imported configuration
                if (!importedConfig.baseProjectsFolder || !importedConfig.projectsData) {
                    throw new Error('Invalid configuration file');
                }
                
                // Check if base folder exists
                const baseFolder = importedConfig.baseProjectsFolder;
                const baseFolderExists = await new Promise<boolean>((resolve) => {
                    fs.access(baseFolder, fs.constants.F_OK, (err) => {
                        resolve(!err);
                    });
                });
                
                if (!baseFolderExists) {
                    const result = await vscode.window.showWarningMessage(
                        `The base folder "${baseFolder}" does not exist. Do you want to select a new base folder?`, 
                        'Yes', 'No'
                    );
                    
                    if (result === 'Yes') {
                        await this.handleSelectBaseFolder();
                        // Get the newly selected folder
                        const config = this.configManager.getConfig();
                        if (config.baseProjectsFolder) {
                            importedConfig.baseProjectsFolder = config.baseProjectsFolder;
                        } else {
                            throw new Error('No base folder selected');
                        }
                    } else {
                        throw new Error('Base folder does not exist');
                    }
                }
                
                // Save the imported configuration
                await this.configManager.saveConfig(importedConfig);
                
                // Update the webview
                await this.updateWebview();
                
                vscode.window.showInformationMessage('Configuration imported successfully!');
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to import configuration: ${error}`);
        }
    }
}
