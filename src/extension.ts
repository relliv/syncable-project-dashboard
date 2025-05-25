// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { ConfigManager } from './configManager';
import { ProjectDashboard } from './projectDashboard';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "syncable-project-dashboard" is now active!');

	// Initialize the config manager
	const configManager = new ConfigManager(context);
	
	// Initialize the project dashboard
	const dashboard = new ProjectDashboard(configManager, context);

	// Register the showDashboard command
	const showDashboardCommand = vscode.commands.registerCommand('syncable-project-dashboard.showDashboard', () => {
		dashboard.open().catch((err: Error) => {
			vscode.window.showErrorMessage(`Failed to open dashboard: ${err}`);
		});
	});

	// Register the previous helloWorld command
	const helloWorldCommand = vscode.commands.registerCommand('syncable-project-dashboard.helloWorld', () => {
		vscode.window.showInformationMessage('Hello World from Syncable Project Dashboard!');
	});

	// Open the dashboard when the extension is activated
	dashboard.open().catch((err: Error) => {
		vscode.window.showErrorMessage(`Failed to open dashboard: ${err}`);
	});

	// Add commands to subscriptions
	context.subscriptions.push(showDashboardCommand, helloWorldCommand);
}

// This method is called when your extension is deactivated
export function deactivate() {}
