# CommandHandler Package 
This Repository is a Package for the FrikyBot.

The CommandHandler Package is a classic Command System you know from Nightbot or Moobot. Its designed to be as familiar as possible, while going beyond whats already available.

Note: This is Code cant be run on its own, its still tied to the FrikyBot Interface and Ecosystem!

## Getting Started
This Package is powered by Node.js and some NPM Modules.

All dependancies are:
* [express](https://www.npmjs.com/package/express) - providing File and API Routing Capabilities
* [node-fetch](https://www.npmjs.com/package/node-fetch) - making fetch() available in node.js

Installing a Package is very easy! Clone this Package to your local machine, wrap it in Folder Named "CommandHandler" and drop that into your FrikyBot Packages Folder.
Now use the FrikyBot WebInterface and add the Package on the Settings->Packages Page.

## Features

### Commands
Commands can be triggered by messages in Chat. These Commands can output plain text, compute text output or trigger APIs.

### Command Variable
Variables are inserted into the output of a command and replaced with content when triggered. Variables range from simple text substitutions over math operations to API Calls and Database queries. Many Variables are inspired by Nightbot, but some have been improved!

Making your own Variables is one of the best features of this Command System. Using a JSON Datastructure your able to dynamicly create, change and access Variable Data of all forms.

### Command Userlevels
Commands can be triggered by authorized users only. This authorization is based on your Twitch Chat badges. The basic mode only uses the standard Mod, VIP or Broadcaster Badges, while the advanced mode can restrict usage to ANY OTHER BADGE and version usable on Twitch. The Follower Userlevel is also available using the Twitch API.

### Command Triggers
Commands are typically only triggered if they are called in the beginning of a message. FrikyBot Commands can have many Trigger settings from beginning to inline or multi-command triggers.

### Timers
Timers can post messages repeatedly. Using an alias, these messages can also be command outputs. Then a Command is posted, that also is posted by a timer, then the timer will be reset - removing bot spam of the same commands.

## Planned Features
* **RegEx** - RegEx based command names and command outputs.
* **Hardcoded Command Settings** - Renaming and changing of subsettings for Hardoded Commands.
* **More Command Variables** - Math Operators and Javascript compiling variables.

## Updates
Follow the official [Twitter](https://twitter.com/FrikyBot) Account or take a look at the [FrikyBot News](https://frikybot.de/News) to see upcomming Features and Updates.

## Authors
* **Tim Klenk** - [FrikyMediaLP](https://github.com/FrikyMediaLP)
