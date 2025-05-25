# Sync- **Auto-start Dashboard**: Opens automatically when VS Code starts.
- **Project Organization**: Groups projects based on folder structure.
- **Quick Navigation**: Open projects with a single click.
- **Configuration Storage**: Remembers your project folder structure.
- **Accordion View**: Collapsible group panels for better organization. Groups are collapsed by default for a cleaner look.
- **Project Count Badges**: Shows the number of projects in each group header, and updates dynamically when filtering.
- **Project Colors**: Uses each project's custom activity bar color for better visual recognition.
- **Search Filter**: Quickly find projects by name.
- **Sorting Options**: Sort projects alphabetically or by color.
- **Group Refresh**: Refresh individual groups without rescanning everything.ect Dashboard

A Visual Studio Code extension that provides a dashboard for easy access to your projects, organized by groups.

## Features

- **Auto-start Dashboard**: Opens automatically when VS Code starts.
- **Project Organization**: Groups projects based on folder structure.
- **Quick Navigation**: Open projects with a single click.
- **Configuration Storage**: Remembers your project folder structure.
- **Accordion View**: Collapsible group panels for better organization.
- **Project Colors**: Uses each project's custom activity bar color for better visual recognition.
- **Search Filter**: Quickly find projects by name.
- **Sorting Options**: Sort projects alphabetically or by color.
- **Group Refresh**: Refresh individual groups without rescanning everything.
- **Configuration Export/Import**: Save and restore your dashboard configuration.

## How It Works

1. When first launched, the dashboard will ask you to select a base projects folder.
2. The extension will scan this folder looking for a two-level structure:
   - First level: Group/Parent folders
   - Second level: Project folders
3. Projects are displayed in collapsible group panels.
4. If a project has a custom color defined in its `.vscode/settings.json` file, the dashboard will use that color for the project box.
5. Use the search box to filter projects by name.
6. Sort projects using the dropdown menu.
7. Click on any project to open it in a new VS Code window.
8. Use the refresh button on a group to update just that group.
9. Export your configuration to a JSON file for backup or sharing.
10. Import a previously saved configuration to restore your dashboard setup.

## Project Structure

The extension expects your projects to be organized in a specific way:

```
BaseProjectsFolder/
  ├── GroupFolder1/
  │   ├── Project1/
  │   ├── Project2/
  │   └── Project3/
  ├── GroupFolder2/
  │   ├── ProjectA/
  │   └── ProjectB/
  └── GroupFolder3/
      └── ProjectX/
```

## Color Customization

The extension automatically detects and uses project-specific color customizations. To set a custom color for your project:

1. In your project, create or edit the `.vscode/settings.json` file
2. Add a color customization for the activity bar:

```json
{
  "workbench.colorCustomizations": {
    "activityBar.background": "#ff0000"  // Example: red color
  }
}
```

This color will be used as the background color for the project's box in the dashboard.

## Commands

- `Syncable Project Dashboard: Show Dashboard` - Opens the project dashboard
- `Syncable Project Dashboard: Hello World` - Display a hello world message (example command)

## Requirements

No special requirements or dependencies.

## Extension Settings

This extension stores its configuration in VS Code's global state and doesn't add any settings to the settings.json file.

## Release Notes

### 0.0.1

Initial release with basic dashboard functionality and project color detection.

---

**Enjoy!**
