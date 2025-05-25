import * as vscode from 'vscode';
import { ConfigManager, ProjectConfig, ProjectInfo } from './configManager';
import * as path from 'path';
import * as fs from 'fs';

export class ProjectDashboard {
    private panel: vscode.WebviewPanel | undefined;
    private configManager: ConfigManager;

    constructor(configManager: ConfigManager) {
        this.configManager = configManager;
    }

    /**
     * Open the dashboard panel
     */
    public async open(context: vscode.ExtensionContext): Promise<void> {
        // If we already have a panel, show it
        if (this.panel) {
            this.panel.reveal(vscode.ViewColumn.One);
            return;
        }

        // Create a new panel
        this.panel = vscode.window.createWebviewPanel(
            'projectDashboard',
            'Project Dashboard',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        // Handle panel disposal
        this.panel.onDidDispose(() => {
            this.panel = undefined;
        }, null, context.subscriptions);

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
                }
            },
            undefined,
            context.subscriptions
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
                    case 'color':
                        // Sort by color (projects with color first, then alphabetically)
                        projects.sort((a, b) => {
                            if (a.color && !b.color) { return -1; }
                            if (!a.color && b.color) { return 1; }
                            return a.name.localeCompare(b.name);
                        });
                        break;
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
     * Get HTML for no folder selected state
     */
    private getNoFolderHtml(): string {
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Project Dashboard</title>
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
            <title>Project Dashboard</title>
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

            groupsHtml += `
                <div class="group">
                    <div class="group-header">
                        <div class="group-name">${groupName}</div>
                        <div class="group-actions">
                            <button class="group-refresh" data-group="${groupName}" title="Refresh this group">↻</button>
                            <div class="group-toggle">▼</div>
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
            <title>Project Dashboard</title>
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
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 20px;
                    padding-bottom: 10px;
                    border-bottom: 1px solid var(--vscode-panel-border);
                }
                .controls {
                    display: flex;
                    gap: 10px;
                    align-items: center;
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
                button {
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    padding: 6px 12px;
                    cursor: pointer;
                    border-radius: 2px;
                    font-size: 12px;
                }
                button:hover {
                    background-color: var(--vscode-button-hoverBackground);
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
                    padding: 10px 15px;
                    background-color: var(--vscode-sideBarSectionHeader-background);
                    cursor: pointer;
                    user-select: none;
                }
                .group-name {
                    font-weight: bold;
                }
                .group-actions {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                }
                .group-toggle {
                    transition: transform 0.2s;
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
                    height: 100px;
                    border-radius: 3px;
                    overflow: hidden;
                    cursor: pointer;
                    transition: transform 0.1s, box-shadow 0.1s;
                    border: 2px solid transparent;
                }
                .project-inner {
                    height: 100%;
                    display: flex;
                    flex-direction: column;
                    justify-content: center;
                    align-items: center;
                    padding: 15px;
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
                    font-weight: bold;
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
                }
                h1 {
                    color: var(--vscode-editor-foreground);
                    font-size: 24px;
                    margin: 0;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>Project Dashboard</h1>
                    <div class="controls">
                        <div class="search-container">
                            <input type="text" id="searchInput" placeholder="Search projects...">
                        </div>
                        <div class="sort-container">
                            <select id="sortSelect">
                                <option value="name-asc">Name (A-Z)</option>
                                <option value="name-desc">Name (Z-A)</option>
                                <option value="color">By Color</option>
                            </select>
                        </div>
                        <button id="rescan">Rescan Projects</button>
                        <button id="changeFolder">Change Base Folder</button>
                    </div>
                </div>
                <div class="groups">
                    ${groupsHtml}
                </div>
                <div class="info">
                    <div>Base Folder: ${config.baseProjectsFolder}</div>
                    <div>Last Scan: ${lastScanTime}</div>
                </div>
            </div>
            <script>
                const vscode = acquireVsCodeApi();
                
                // Toggle group collapse
                document.querySelectorAll('.group-header').forEach(header => {
                    header.addEventListener('click', (e) => {
                        // Don't toggle if clicking on the refresh button
                        if (e.target.classList.contains('group-refresh')) {
                            return;
                        }
                        const group = header.parentElement;
                        group.classList.toggle('collapsed');
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
                        const hasVisibleProjects = Array.from(group.querySelectorAll('.project'))
                            .some(project => project.style.display !== 'none');
                        group.style.display = hasVisibleProjects ? '' : 'none';
                    });
                });
            </script>
        </body>
        </html>`;
    }
}
