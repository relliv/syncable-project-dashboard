import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export interface ProjectConfig {
    baseProjectsFolder?: string;
    projectsData?: {
        [groupName: string]: string[]; // Group name -> array of project paths
    };
    lastScanTime?: number;
}

export class ConfigManager {
    private context: vscode.ExtensionContext;
    private configKey = 'syncableProjectDashboard.config';

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    /**
     * Get the current configuration
     */
    public getConfig(): ProjectConfig {
        return this.context.globalState.get<ProjectConfig>(this.configKey, {});
    }

    /**
     * Save the configuration
     */
    public saveConfig(config: ProjectConfig): Thenable<void> {
        return this.context.globalState.update(this.configKey, config);
    }

    /**
     * Set the base projects folder path
     */
    public async setBaseProjectsFolder(folderPath?: string): Promise<string | undefined> {
        // If folder path is not provided, ask the user to select one
        if (!folderPath) {
            const options: vscode.OpenDialogOptions = {
                canSelectFiles: false,
                canSelectFolders: true,
                canSelectMany: false,
                title: 'Select Base Projects Folder'
            };

            const folderUri = await vscode.window.showOpenDialog(options);
            if (!folderUri || folderUri.length === 0) {
                return undefined;
            }
            folderPath = folderUri[0].fsPath;
        }

        // Validate the folder exists
        if (!fs.existsSync(folderPath)) {
            throw new Error(`Folder does not exist: ${folderPath}`);
        }

        // Save the folder path in config
        const config = this.getConfig();
        config.baseProjectsFolder = folderPath;
        await this.saveConfig(config);
        
        return folderPath;
    }

    /**
     * Scan the projects directory and update the config
     */
    public async scanProjects(): Promise<ProjectConfig> {
        const config = this.getConfig();
        
        if (!config.baseProjectsFolder) {
            throw new Error('Base projects folder not set');
        }

        // Ensure the folder exists
        if (!fs.existsSync(config.baseProjectsFolder)) {
            throw new Error(`Base projects folder does not exist: ${config.baseProjectsFolder}`);
        }

        const projectsData: { [groupName: string]: string[] } = {};

        // Read first level directories (group folders)
        const groupFolders = fs.readdirSync(config.baseProjectsFolder, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => dirent.name);

        // For each group folder, get the project folders
        for (const groupName of groupFolders) {
            const groupPath = path.join(config.baseProjectsFolder, groupName);
            const projectFolders = fs.readdirSync(groupPath, { withFileTypes: true })
                .filter(dirent => dirent.isDirectory())
                .map(dirent => dirent.name);

            projectsData[groupName] = projectFolders;
        }

        // Update the config
        config.projectsData = projectsData;
        config.lastScanTime = Date.now();
        await this.saveConfig(config);

        return config;
    }
}
