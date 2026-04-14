How to use this sample to create a custom plugin
https://github.com/obsidianmd/obsidian-sample-plugin 
The repository is explicitly designed to act as a "template" for building custom plugins. Here is the workflow for customizing it:

Clone and Setup:

Click "Use this template" on the GitHub repository to create your own copy.

Clone your new repository into a local development folder. For testing convenience, it is recommended to clone it directly into your vault at .obsidian/plugins/your-plugin-name.

Ensure NodeJS is installed (at least v16) and run npm i to install dependencies.

Rename and Customize Metadata:

Update manifest.json with your custom plugin's id, name, version, and description.

In the source code, rename placeholder classes like StanleyPlugin and StanleySettingTab, and interfaces like StanleySettings to match your plugin's identity.

Development Iteration:

Run npm run dev in your terminal. This will watch your .ts files and automatically recompile main.js whenever you make changes.

Develop your logic by adding code to onload() or creating new typescript files.

Reload Obsidian to test the newly compiled version of your plugin.

Releasing:

When finished, bump your version numbers in manifest.json and versions.json (you can use npm version patch/minor/major to simplify this).

Create a GitHub release tagged with your exact version number (without a 'v' prefix) and upload main.js, manifest.json, and styles.css as binary attachments.