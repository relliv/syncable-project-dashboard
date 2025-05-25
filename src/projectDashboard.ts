import * as vscode from 'vscode';
import { ConfigManager, ProjectConfig } from './configManager';
import * as path from 'path';

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

            for (const projectName of projects) {
                projectsHtml += `
                    <div class="project" data-path="${groupName}/${projectName}">
                        <div class="project-inner">
                            <div class="project-name">${projectName}</div>
                        </div>
                    </div>
                `;
            }

            groupsHtml += `
                <div class="group">
                    <div class="group-header">
                        <div class="group-name">${groupName}</div>
                        <div class="group-toggle">▼</div>
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
                .group-toggle {
                    transition: transform 0.2s;
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
                }
                .project:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
                }
                .project-name {
                    font-weight: bold;
                    word-break: break-word;
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
                    header.addEventListener('click', () => {
                        const group = header.parentElement;
                        group.classList.toggle('collapsed');
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
            </script>
        </body>
        </html>`;
    }
}
