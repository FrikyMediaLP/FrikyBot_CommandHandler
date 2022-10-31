const CONSTANTS = require('./../../Util/CONSTANTS.js');
const TWITCHIRC = require('./../../Modules/TwitchIRC.js');
const FrikyDB = require('./../../Util/FrikyDB.js');

const express = require('express');
const path = require('path');
const fs = require('fs');
const FETCH = require('node-fetch');

const COMMAND_TEMPLATE = {
    cooldown: "string",
    output: "string",
    detection_type: "string",
    description: "string",
    userlevel: "string",
    strictlevel: "number",
    case: "boolean",
    enabled: "boolean",
    name: "string",
    counter: "number",
    alias: "string",
    regex: "string",
    added_by: "string",
    viewing_restriction: "boolean"
};
const COMMAND_TEMPLATE_REQUIRED = {
    output: "string",
    name: "string"
};
const TIMER_TEMPLATE = {
    interval: "string",
    lines: "number",
    output: "string",
    description: "string",
    enabled: "boolean",
    name: "string",
    alias: "string",
    added_by: "string",
    auto_enable: "string",
    game: "string",
    viewing_restriction: "boolean"
};
const TIMER_TEMPLATE_REQUIRED = {
    interval: "string",
    output: "string",
    name: "string"
};

const PACKAGE_DETAILS = {
    name: "CommandHandler",
    description: "Typical Command Handler as you know it!",
    picture: "/images/icons/command.svg",
    api_requierements: {
        eventsubs: ['channel.update', 'stream.online', 'stream.offline', 'channel.poll.begin', 'channel.poll.progress', 'channel.poll.end', 'channel.prediction.update', 'channel.prediction.progress', 'channel.prediction.end'],
        endpoints: ['GetStreams', 'GetChannelInformation', 'ModifyChannelInformation', 'SearchCategories', 'CreateClip', 'GetClips', 'CreatePoll', 'EndPoll', 'CreatePrediction', 'EndPrediction', 'GetUsers', 'GetStreamTags', 'GetBroadcasterSubscriptions', 'GetUsersFollows', 'GetChannelEmotes']
    },
    version: '0.4.1.0',
    server: '0.4.0.0',
    modules: {
        twitchapi: '0.4.0.0',
        twitchirc: '0.4.0.0',
        webapp: '0.4.0.0'
    },
    packages: []
};

class CommandHandler extends require('./../../Util/PackageBase.js').PackageBase {
    constructor(webappinteractor, twitchirc, twitchapi, logger) {
        super(PACKAGE_DETAILS, webappinteractor, twitchirc, twitchapi, logger);

        //Change Config Defaults
        this.Config.EditSettingTemplate('HTML_ROOT_NAME', { default: 'Commands' });
        this.Config.EditSettingTemplate('API_ROOT_NAME', { default: 'Commands' });

        this.Config.AddSettingTemplates([
            { name: 'data_dir', type: 'string', default: CONSTANTS.FILESTRUCTURE.PACKAGES_INSTALL_ROOT + "CommandHandler/data/" },
            { name: 'disabled_hccommands', type: 'array', title: 'All disabled HC Cmds', default: [] },
            { name: 'renamed_hccommands', type: 'array', title: 'All renamed HC Cmds', default: [] },
            { name: 'command_timer_reset', type: 'boolean', default: true },
            { name: '!clip_userlevel', type: 'string', default: 'regular' },
            { name: '!clip_delay', type: 'boolean', default: false },
            { name: 'poll_title', type: 'string', default: 'Please vote now!' },
            { name: 'poll_duration', type: 'number', default: 60 },
            { name: 'poll_choice_1', type: 'string', default: 'A' },
            { name: 'poll_choice_2', type: 'string', default: 'B' },
            { name: 'poll_choice_3', type: 'string', default: 'C' },
            { name: 'poll_choice_4', type: 'string', default: 'D' },
            { name: 'poll_choice_5', type: 'string', default: 'E' },
            { name: 'pred_title', type: 'string', default: 'Can I beat this Challenge!' },
            { name: 'pred_duration', type: 'number', default: 60 },
            { name: 'pred_outcome_blue', type: 'string', default: 'YES' },
            { name: 'pred_outcome_pink', type: 'string', default: 'NO' },
            { name: 'timezone', type: 'string', default: '' },
            { name: 'website_userlevel', type: 'string', default: 'viewer', selection: ['viewer', 'moderator', 'staff', 'admin'], title: 'Website Userlevel Restriction', description: 'Restrict Access to the CommandHandler Website for Users below the given Userlevel.' }
        ]);
        this.Config.Load();
        this.Config.FillConfig();

        //STATS
        this.STAT_NUB_COMMANDS = 0;
        this.STAT_NUB_COMMANDS_PER_10 = 0;

        this.STAT_AVG_TIME = 0;
        this.STAT_AVG_TIME_PER_10 = 0;
        
        this.STAT_MINUTE_TIMER = setInterval(() => {
            this.STAT_NUB_COMMANDS_PER_10 = 0;
            this.STAT_AVG_TIME_PER_10 = 0;
        }, 600000);
        
        //Displayables
        this.addDisplayables([
            { name: 'Total Number of Commands', value: () => this.STAT_NUB_COMMANDS },
            { name: 'Number of Commands Per 10 Min', value: () => this.STAT_NUB_COMMANDS_PER_10 },
            { name: 'Average Time to Analyse Messages', value: () => this.STAT_AVG_TIME + 'ms' },
            { name: 'avg. Time to Analyse Messages Per 10 Min', value: () => this.STAT_AVG_TIME_PER_10 + 'ms' }
        ]);

        //Controllables
        this.addControllables([
            { name: 'poll_stream', title: 'Poll Stream Data', callback: async (user) => this.Controllable_PollStream() }
        ]);
    }

    async Init(startparameters) {
        if (!this.isEnabled()) return Promise.resolve();
        let cfg = this.Config.GetConfig();

        //Setup File Structure
        const files = [cfg['data_dir']];
        for (let file of files) {
            try {
                if (!fs.existsSync(path.resolve(file))) {
                    fs.mkdirSync(path.resolve(file));
                }
            } catch (err) {
                this.Logger.error(err.message);
            }
        }
        
        this.CommandVariables = {};
        this.CustomVariables = {};
        this.CustomCommands = [];
        this.onCooldown = [];
        this.HardcodedCommands = {};
        this.Timers = [];
        this.ActiveTimers = [];

        this.WatchTimeDB = new FrikyDB.Collection({ path: path.resolve(cfg['data_dir'] + 'watchtime.db') });
        this.WatchTime_Interval = null;
        
        this.setWebNavigation({
            name: "Commands",
            href: this.getHTMLROOT(),
            icon: "images/icons/command.svg"
        }, "Main", () => this.Config.GetConfig()['website_userlevel']);
        
        this.HardcodedCommands = {
            "!bot": new HCCommand("!bot", async (userMessageObj, parameters) => {
                let api_status = 'OFFLINE';
                if (this.TwitchAPI.AppAccessToken) api_status = 'PARTIAL';
                if (this.TwitchAPI.UserAccessToken) api_status = 'ONLINE';

                let irc_outages = this.TwitchIRC.STAT_CONNECTION_TO_PER_10;
                return this.TwitchIRC.say("MrDestructoid FrikyBot Online - API Status: " + api_status + " - IRC Status: " + irc_outages + " Outages/10min ! MrDestructoid");
            },
                {
                    description: 'Test Command to check the Bot Connection and Status.'
                }),
            "!game": new HCCommand("!game", async (userMessageObj, parameters) => {
                try {
                    if (userMessageObj.matchUserlevel('moderator') && parameters.length > 1 && parameters[1].indexOf('@') !== 0) {
                        //Set Game
                        if (parameters.slice(1).join(" ") === "0" || parameters.slice(1).join(" ") === "UNSET") {
                            //UNSET GAME
                            await this.TwitchAPI.ModifyChannelInformation({ broadcaster_id: userMessageObj.getRoomID() }, { game_id: 0 });
                            return this.TwitchIRC.say(userMessageObj.getDisplayName() + " -> Game was unset!");
                        } else {
                            //Set new Game
                            let games = (await this.TwitchAPI.SearchCategories({ query: parameters.slice(1).join(" "), first: 1 })).data;

                            if (games.length === 0) {
                                this.TwitchIRC.say(userMessageObj.getDisplayName() + " -> No Game found by that name! ").catch(err => this.Logger.error(err.message));
                                return Promise.reject(new Error('Game not found!'));
                            }
                            
                            await this.TwitchAPI.ModifyChannelInformation({ broadcaster_id: userMessageObj.getRoomID() }, { game_id: games[0].id });
                            return this.TwitchIRC.say(userMessageObj.getDisplayName() + " -> Game was set to " + games[0].name + " !");
                        }
                    } else {
                        //Print Game
                        let text = "";
                        const Channel_data = (await this.TwitchAPI.GetChannelInformation({ broadcaster_id: userMessageObj.getRoomID() })).data[0];
                        text = userMessageObj.getChannel(true) + " is currently playing " + Channel_data.game_name;
                        if (parameters.length > 1) text = parameters[1] + " -> " + text;
                        else if (!userMessageObj.matchUserlevel('moderator')) text = userMessageObj.getDisplayName() + " -> " + text;

                        if (text) return this.TwitchIRC.say(text);
                        else return Promise.resolve();
                    }
                } catch (err) {
                    this.TwitchIRC.say("Somthing went wrong, maybe the Bot-User hasnt Access to change games?").catch(err => this.Logger.error(err.message));;
                    return Promise.reject(err);
                }
            },
                {
                    description: 'Prints the current Game to the User. Mods can @ a User like this: "!game @USERNAME", or set the Game like this: "!game GAMENAME" (use !game UNSET or !game 0 to unset the game), the Bot wont @ Mods when they just call "!game".',
                    api_requierements: [{ scope: 'channel:manage:broadcast' } ]
                }),
            "!title": new HCCommand("!title", async (userMessageObj, parameters) => {
                try {
                    if (userMessageObj.matchUserlevel('moderator') && parameters.length > 1 && parameters[1].indexOf('@') !== 0) {
                        //Set Title
                        (await this.TwitchAPI.ModifyChannelInformation({ broadcaster_id: userMessageObj.getRoomID() }, { title: parameters.slice(1).join(" ") }));
                        return this.TwitchIRC.say(userMessageObj.getDisplayName() + " -> Title was set to " + parameters.slice(1).join(" "));
                    } else {
                        //Print Title
                        let text = "";
                        const Channel_data = (await this.TwitchAPI.GetChannelInformation({ broadcaster_id: userMessageObj.getRoomID() })).data[0];
                        text = "Current Title: " + Channel_data.title;
                        if (parameters.length > 1) text = parameters[1] + " -> " + text;
                        else if (!userMessageObj.matchUserlevel('moderator')) text = userMessageObj.getDisplayName() + " -> " + text;

                        if (text) return this.TwitchIRC.say(text);
                        else return Promise.resolve();
                    }
                } catch (err) {
                    this.TwitchIRC.say("Somthing went wrong, maybe the Bot-User hasnt Access to change games?").catch(err => this.Logger.error(err.message));
                    return Promise.reject(err);
                }
            },
                {
                    description: 'Prints the current Title to the User. Mods can @ a User like this: "!title @USERNAME", or set the Title like this: "!title TITLE TEXT HERE", the Bot wont @ Mods when they just call "!title".',
                    api_requierements: [{ scope: 'channel:manage:broadcast' }]
                }),
            "!clip": new HCCommand("!clip", async (userMessageObj, parameters) => {
                let cfg = this.GetConfig();
                let created_clip = null;

                if (userMessageObj.matchUserlevel(cfg['!clip_userlevel'])) {
                    //Create Clip
                    try {
                        created_clip = await this.TwitchAPI.CreateClip({ broadcaster_id: userMessageObj.getRoomID() });
                        created_clip = created_clip.data[0];
                    } catch (err) {
                        this.TwitchIRC.say("Clip couldnt be created! (Creation)").catch(err => this.Logger.error(err.message));
                        return Promise.reject(err);
                    }

                    //Confirm created
                    return new Promise((resolve, reject) => {
                        setTimeout(async () => {
                            try {
                                let requested_clips = await this.TwitchAPI.GetClips({ id: created_clip['id'] });
                                if (requested_clips.data[0].id === created_clip['id']) {
                                    this.TwitchIRC.say("Clip created! " + requested_clips.data[0].url).catch(err => this.Logger.error(err.message));
                                    resolve();
                                }
                                else {
                                    this.TwitchIRC.say("Clip couldnt be created! (Confirmation)").catch(err => this.Logger.error(err.message));
                                    reject(new Error("Clip not found!"));
                                }
                            } catch (err) {
                                this.TwitchIRC.say("Clip couldnt be created! (Confirmation)").catch(err => this.Logger.error(err.message));
                                reject(err);
                            }
                        }, 15 * 1000);
                    });
                }
            },
                {
                    description: '<p>Creates a Clip of the past 30 Seconds. This can take a minute or two!</p><p>Delay and min. Userlevel can be changed in the Package Settings!</p>',
                    api_requierements: [{ scope: 'clips:edit' }]
                }),
            "!startpoll": new HCCommand("!startpoll", async (userMessageObj, parameters) => {
                if (!userMessageObj.matchUserlevel('moderator')) return Promise.resolve();
                let cfg = this.GetConfig();

                //Fetch Poll
                try {
                    let polls = await this.TwitchAPI.GetPolls({ broadcaster_id: userMessageObj.getRoomID(), first: 1 });

                    //Is running?
                    if (polls.data.length > 0 && polls.data[0].status === 'ACTIVE') {
                        this.TwitchIRC.say("Another Poll is still running!").catch(err => this.Logger.error(err.message));
                        return Promise.resolve();
                    }
                } catch (err) {
                    return Promise.reject(err);
                }

                //Create Poll
                let poll_request = {
                    broadcaster_id: userMessageObj.getRoomID(),
                    title: cfg['poll_title'],
                    choices: [],
                    duration: cfg['poll_duration']
                };

                if (parameters.length > 1) {
                    //Extract "" from Parameters
                    let better_params = [];

                    for (let i = 0; i < parameters.length; i++) {
                        if (parameters[i].startsWith('"')) {
                            let new_param = [];
                            let j = i;
                            for (j; j < parameters.length; j++) {
                                new_param.push(parameters[j]);
                                if (parameters[j].endsWith('"')) break;
                            }
                            better_params.push(new_param.join(" "));
                            i = j;
                        }
                        else better_params.push(parameters[i]);
                    }

                    //Apply Parameters
                    for (let i = 0; i < better_params.length; i++) {
                        let param = better_params[i];

                        //Option?
                        if (param.startsWith('-')) {
                            let option = param.substring(1, param.indexOf('='));
                            let value = param.substring(param.indexOf('=') + 1);

                            try {
                                if (option === 'd') poll_request.duration = parseInt(value);
                                else if (option === 'bv') poll_request.bits_voting_enabled = value === 'true';
                                else if (option === 'bmin') poll_request.bits_per_vote = parseInt(value);
                                else if (option === 'cpv') poll_request.channel_points_voting_enabled = value === 'true';
                                else if (option === 'cpmin') poll_request.channel_points_per_vote = parseInt(value);
                            } catch (err) {
                                this.TwitchIRC.say("Poll couldnt be created! Error: '" + option + "'").catch(err => this.Logger.error(err.message));
                                return Promise.reject(err);
                            }
                        } else if (param.startsWith('"')) {
                            if (i === 1) poll_request.title = param.split('"')[1];
                            else if (i > 1 && i < 7) poll_request.choices.push({ title: param.split('"')[1] });
                        }
                    }
                }

                //Add Default Choices
                if (poll_request.choices.length === 0) {
                    for (let i = 1; i <= 5; i++)
                        if (cfg['poll_choice_' + i] !== '' && cfg['poll_choice_' + i] !== undefined)
                            poll_request['choices'].push({ title: cfg['poll_choice_' + i] });
                }

                //Create Poll
                try {
                    let poll = await this.TwitchAPI.CreatePoll({}, poll_request);
                    if (poll.data.length > 0) return Promise.resolve();
                    this.TwitchIRC.say("Poll couldnt be created!").catch(err => this.Logger.error(err.message));
                    return Promise.reject(new Error("Poll couldnt be created!"));
                } catch (err) {
                    this.TwitchIRC.say("Poll couldnt be created!").catch(err => this.Logger.error(err.message));
                    return Promise.reject(err);
                }
            },
                {
                    description: '<p>Creates a Twitch Poll!</p><p>Default Title, Duration, Choices and other Poll Options can be changed in the Package Settings! Or use the Syntax below!</p><h3>Syntax:</h3><b>!startpoll</span> <span>"[title]"</span> <span>"[choice1]"</span> ... <span>"[choice5]"</span> <span>(option1)</span> <span>(option2)</span> ... <span>(optionN)</span></b><p><b>title</b> - Poll Title Text (max. 60 characters, dont forget the "")</p><p><b>choiceN</b> - 1 of max. 5 Choice Titles (max. 25 characters, dont forget the "")</p><p><b>options</b> - Options start with a "-" followed by one of the following identifiers and end with an "=" followed by the value.</b></p><p><b>options identifiers</b>: <ul><li><b>d</b> - duration in seconds (min. 15, max. 1800)</li><li><b>bv</b> - Enable Bits Voting (true or false)</li><li><b>bmin</b> - Minimum amount of Bits to vote (min. 0, max. 10.000)</li><li><b>cpv</b> - Enable Channel Points Voting (true or false)</li><li><b>cpmin</b> - Minimum amount of Channel Points to vote (min. 0, max. 10.000)</li></ul></p><p>Note: Only Title and Choices are restricted to be set in order, options can have any order AFTER title and choices(if present)!</p><p>e.g. !startpoll "What should I play today?" "Minecraft" "LoL" "Fortnite" -d=100</p>',
                    api_requierements: [{ scope: 'channel:manage:polls' }],
                    viewing_restriction: true
                }),
            "!stoppoll": new HCCommand("!stoppoll", async (userMessageObj, parameters) => {
                if (!userMessageObj.matchUserlevel('moderator')) return Promise.resolve();
                let polls = null;

                //Fetch Poll
                try {
                    polls = await this.TwitchAPI.GetPolls({ broadcaster_id: userMessageObj.getRoomID(), first: 1 });

                    //Is running?
                    if (polls.data.length === 0 || polls.data[0].status !== 'ACTIVE') {
                        this.TwitchIRC.say("No active Poll found!").catch(err => this.Logger.error(err.message));
                        return Promise.resolve();
                    } 
                } catch (err) {
                    return Promise.reject(err);
                }

                //Create Poll data
                let poll_request = {
                    broadcaster_id: userMessageObj.getRoomID(),
                    id: polls.data[0].id,
                    status: 'TERMINATED'
                };

                //Stop Poll
                try {
                    await this.TwitchAPI.EndPoll({}, poll_request);
                } catch (err) {

                }

                return Promise.resolve();
            },
                {
                    description: '<p>Tops a currently runnning Twitch Poll!</p>',
                    api_requierements: [{ scope: 'channel:manage:polls' }],
                    viewing_restriction: true
                }),
            "!startpred": new HCCommand("!startpred", async (userMessageObj, parameters) => {
                if (!userMessageObj.matchUserlevel('moderator')) return Promise.resolve();

                //Fetch Prediction
                try {
                    let predictions = await this.TwitchAPI.GetPredictions({ broadcaster_id: userMessageObj.getRoomID(), first: 1 });

                    //Is running?
                    if (predictions.data.length > 0 && predictions.data[0].status === 'ACTIVE') {
                        this.TwitchIRC.say("Another Prediction is still running!").catch(err => this.Logger.error(err.message));
                        return Promise.resolve();
                    }
                } catch (err) {
                    return Promise.reject(err);
                }

                let cfg = this.GetConfig();
                
                //Create Prediction
                let pred_request = {
                    broadcaster_id: userMessageObj.getRoomID(),
                    title: cfg['pred_title'],
                    outcomes: [{ title: cfg['pred_outcome_blue'] }, { title: cfg['pred_outcome_pink'] }],
                    prediction_window: cfg['pred_duration']
                };

                if (parameters.length > 1) {
                    //Extract "" from Parameters
                    let better_params = [];

                    for (let i = 0; i < parameters.length; i++) {
                        if (parameters[i].startsWith('"')) {
                            let new_param = [];
                            let j = i;
                            for (j; j < parameters.length; j++) {
                                new_param.push(parameters[j]);
                                if (parameters[j].endsWith('"')) break;
                            }
                            better_params.push(new_param.join(" "));
                            i = j;
                        }
                        else better_params.push(parameters[i]);
                    }

                    try {
                        //Apply Parameters
                        pred_request.title = better_params[1];
                        if (better_params.length > 3) {
                            pred_request.outcomes = [];
                            for (let outcome of better_params.slice(2)) {
                                if (outcome.charAt(0) !== '"') break;
                                pred_request.outcomes.push({ title: outcome });
                            }
                        }
                        if (better_params[better_params.length - 1].charAt(0) !== '"') pred_request.prediction_window = parseInt(better_params[4]);
                    } catch (err) {
                        this.TwitchIRC.say("Prediction couldnt be created! ").catch(err => this.Logger.error(err.message));
                        return Promise.reject(err);
                    }
                }

                //Create Prediction
                try {
                    let pred = await this.TwitchAPI.CreatePrediction({}, pred_request);
                    if (pred.data.length > 0) return Promise.resolve();

                    this.TwitchIRC.say("Prediction couldnt be created!").catch(err => this.Logger.error(err.message));
                    return Promise.reject(new Error('Prediction couldnt be created!'));
                } catch (err) {
                    this.TwitchIRC.say("Prediction couldnt be created!").catch(err => this.Logger.error(err.message));
                    return Promise.reject(err);
                }
            },
                {
                    description: '<p>Creates a Twitch Prediction!</p><p>Default Title, Duration and Outcomes can be changed in the Package Settings! Or use the Syntax below!</p><h3>Syntax:</h3><b>!startpred</span> <span>"[title]"</span> <span>"[outcome 1]"</span> <span>"[outcome 2]"</span> <span>(outcome 3)</span> ... <span>(outcome 10)</span> <span>duration</span></b><p><b>title</b> - Prediction Title Text (max. 45 characters, dont forget the "")</p><p><b>outcome 1-10</b> - Outcome Titles (max. 25 characters, min. 2 needed, max. 10 allowed, dont forget the "")</p><p><b>duration</b> - Prediction voting Window in Seconds (min. 1, max. 1800)</p><p>e.g. !startpred "Will I win this match?" "YEP" "N OMEGALUL" 100</p>',
                    api_requierements: [{ scope: 'channel:manage:predictions' }],
                    viewing_restriction: true
                }),
            "!lockpred": new HCCommand("!lockpred", async (userMessageObj, parameters) => {
                if (!userMessageObj.matchUserlevel('moderator')) return Promise.resolve();
                let predictions = null;

                //Fetch Prediction
                try {
                    predictions = await this.TwitchAPI.GetPredictions({ broadcaster_id: userMessageObj.getRoomID(), first: 1 });

                    //Is running?
                    if (predictions.data.length === 0 || predictions.data[0].status !== 'ACTIVE') {
                        this.TwitchIRC.say("No Prediction found!").catch(err => this.Logger.error(err.message));
                        return Promise.resolve();
                    }
                } catch (err) {
                    return Promise.reject(err);
                }

                //Create Prediction data
                let pred_request = {
                    broadcaster_id: userMessageObj.getRoomID(),
                    id: predictions.data[0].id,
                    status: 'LOCKED'
                };

                //Lock Prediction
                try {
                    await this.TwitchAPI.EndPrediction({}, pred_request);
                } catch (err) {

                }

                return Promise.resolve();
            },
                {
                    description: '<p>Locks a currently runnning Twitch Prediction from further voting!</p>',
                    api_requierements: [{ scope: 'channel:manage:predictions' }],
                    viewing_restriction: true
                }),
            "!cancelpred": new HCCommand("!cancelpred", async (userMessageObj, parameters) => {
                if (!userMessageObj.matchUserlevel('moderator')) return Promise.resolve();
                let predictions = null;

                //Fetch Prediction
                try {
                    predictions = await this.TwitchAPI.GetPredictions({ broadcaster_id: userMessageObj.getRoomID(), first: 1 });

                    //Is running?
                    if (predictions.data.length === 0 || predictions.data[0].status !== 'ACTIVE') {
                        this.TwitchIRC.say("No Prediction found!").catch(err => this.Logger.error(err.message));
                        return Promise.resolve();
                    }
                } catch (err) {
                    return Promise.reject(err);
                }
                
                //Create Prediction data
                let pred_request = {
                    broadcaster_id: userMessageObj.getRoomID(),
                    id: predictions.data[0].id,
                    status: 'CANCELED'
                };

                //Cancel Prediction
                try {
                    await this.TwitchAPI.EndPrediction({}, pred_request);
                } catch (err) {

                }

                return Promise.resolve();
            },
                {
                    description: '<p>Cancels a currently runnning Twitch Prediction and refunds all points!</p>',
                    api_requierements: [{ scope: 'channel:manage:predictions' }],
                    viewing_restriction: true
                }),
            "!resolvepred": new HCCommand("!resolvepred", async (userMessageObj, parameters) => {
                if (!userMessageObj.matchUserlevel('moderator')) return Promise.resolve();

                if (isNaN(parameters[1])) {
                    this.TwitchIRC.say("Not a valid Outcome! Use a Number from 1 to 10!").catch(err => this.Logger.error(err.message));
                    return Promise.reject();
                }
                
                let predictions = null;

                //Fetch Prediction
                try {
                    predictions = await this.TwitchAPI.GetPredictions({ broadcaster_id: userMessageObj.getRoomID(), first: 1 });

                    //Is running?
                    if (predictions.data.length === 0 || predictions.data[0].status !== 'ACTIVE') {
                        this.TwitchIRC.say("No Prediction found!").catch(err => this.Logger.error(err.message));
                        return Promise.resolve();
                    }
                } catch (err) {
                    return Promise.reject(err);
                }

                if (!predictions.data[0].outcomes.length < parseInt(parameters[1])) {
                    this.TwitchIRC.say("Not a valid Outcome!").catch(err => this.Logger.error(err.message));
                    return Promise.reject();
                }

                //Create Prediction
                let pred_request = {
                    broadcaster_id: userMessageObj.getRoomID(),
                    id: predictions.data[0].id,
                    status: 'RESOLVED',
                    winning_outcome_id: predictions.data[0].outcomes[parseInt(parameters[1])].id
                };

                //Resolve Prediction
                try {
                    await this.TwitchAPI.EndPrediction({}, pred_request);
                } catch (err) {

                }

                return Promise.resolve();
            },
                {
                    description: '<p>Resolves a currently runnning Twitch Prediction and hands out rewards! Use "!resolvepred 1", "!resolvepred 2" ... "!resolvepred 10" to select an outcome!</p>',
                    api_requierements: [{ scope: 'channel:manage:predictions' }],
                    viewing_restriction: true
                }),
            "!commands": new HCCommand("!commands", async (userMessageObj, parameters) => {
                if (!userMessageObj.matchUserlevel('moderator')) {
                    return Promise.reject(new Error("Not a Moderator!"));
                }
                
                const TRIGGER_MODES = ['beginning_only_detection', 'inline_detection', 'multi_detection', 'multi_inline_detection'];
                const identifiers = {
                    'ul': { trans: 'userlevel', func: (x) => x },
                    'cd': { trans: 'cooldown', func: (x) => this.parseCooldownString(x) >= 0 ? x : null },
                    'dm': { trans: 'detection_type', func: (x) => TRIGGER_MODES.find(elt => elt === x) },
                    'en': { trans: 'enabled', func: (x) => x == 'true' || x == 'false' ? x == 'true' : null },
                    'sl': { trans: 'strictlevel', func: (x) => parseInt(x) < 0 || parseInt(x) > 3 ? null : parseInt(x) },
                    'dc': { trans: 'description', func: (x) => x },
                    'a': {
                        trans: 'alias', func: (x, start) => {
                            let str = x + " " + parameters.slice(start + 1).join(" ");
                            return str.substring(str.indexOf('"') + 1, str.lastIndexOf('"'));
                        }
                    }
                };

                let action = parameters[1];
                let name = parameters[2];
                let options = [];
                let output = "";

                //Collect Data
                for (let i = 3; i < parameters.length; i++) {
                    if (parameters[i].charAt(0) === '-') {
                        options.push({ name: parameters[i].substring(1, parameters[i].indexOf('=')), value: parameters[i].substring(parameters[i].indexOf('=') + 1), start: i });
                    } else {
                        output = parameters.slice(i).join(" ");
                        break;
                    }
                }

                let cmd_index = -1;
                this.CustomCommands.find((elt, idx) => {
                    if (elt.name === name) {
                        cmd_index = idx;
                        return true;
                    }
                    return false;
                });

                if (action === 'remove') {
                    if (cmd_index < 0) {
                        this.TwitchIRC.say(userMessageObj.getDisplayName() + " -> Command " + name + " doesnt exists!").catch(err => this.Logger.error(err.message));
                        return Promise.reject(new Error('Command not found!'));
                    }

                    //Remove
                    let s = this.removeCommand(name, userMessageObj.getDisplayName());

                    //Failed
                    if (s !== true) {
                        this.TwitchIRC.say(userMessageObj.getDisplayName() + " -> Command failed to be removed!").catch(err => this.Logger.error(err.message));
                        return Promise.reject(new Error(s));
                    }

                    //Success
                    this.TwitchIRC.say(userMessageObj.getDisplayName() + " -> Command " + name + " removed successfully!").catch(err => this.Logger.error(err.message));
                    return Promise.resolve();
                } else if (action === 'rename') {
                    //Cur Command
                    if (cmd_index < 0) {
                        this.TwitchIRC.say(userMessageObj.getDisplayName() + " -> Command " + name + " doesnt exists!").catch(err => this.Logger.error(err.message));
                        return Promise.reject(new Error('Command not found!'));
                    }

                    //New Command
                    let new_cmd_index = -1;
                    this.CustomCommands.find((elt, idx) => {
                        if (elt.name === output) {
                            new_cmd_index = idx;
                            return true;
                        }
                        return false;
                    });

                    if (new_cmd_index >= 0) {
                        this.TwitchIRC.say(userMessageObj.getDisplayName() + " -> Command " + output + " allready exists!").catch(err => this.Logger.error(err.message));
                        return Promise.reject(new Error('Command allready exists!'));
                    }

                    //Rename
                    let s = this.renameCommand(name, output, userMessageObj.getDisplayName());

                    //Failed
                    if (s !== true) {
                        this.TwitchIRC.say(userMessageObj.getDisplayName() + " -> Command failed to be renamed!").catch(err => this.Logger.error(err.message));
                        return Promise.reject(new Error(s));
                    }

                    //Success
                    this.TwitchIRC.say(userMessageObj.getDisplayName() + " -> Command " + name + " renamed successfully to " + output + " !").catch(err => this.Logger.error(err.message));
                    return Promise.resolve();
                }

                //Create new/updated Data
                let json = { output, name };
                for (let opt of options) {
                    if (identifiers[opt.name] === undefined) {
                        this.TwitchIRC.say(userMessageObj.getDisplayName() + " -> Command could not be created/updated - Issue: Unsupported identifier " + opt.name).catch(err => this.Logger.error(err.message));
                        return Promise.reject(new Error('Command Options wrong!'));
                    }

                    let result = identifiers[opt.name].func(opt.value, opt.start);
                    if (result === undefined || result === null) {
                        this.TwitchIRC.say(userMessageObj.getDisplayName() + " -> Command could not be created/updated - Issue: Wrong Format or Value of " + opt.name).catch(err => this.Logger.error(err.message));
                        return Promise.reject(new Error('Command Options wrong!'));
                    }
                    json[identifiers[opt.name].trans] = result;
                }

                if (json.alias) delete json.output;

                if (action === 'add') {
                    if (cmd_index > 0) {
                        this.TwitchIRC.say(userMessageObj.getDisplayName() + " -> Command " + name + " allready exists!").catch(err => this.Logger.error(err.message));
                        return Promise.reject(new Error('Command allready exists!'));
                    } else if (!json.output && !json.alias) {
                        this.TwitchIRC.say(userMessageObj.getDisplayName() + " -> Output must be supplied!").catch(err => this.Logger.error(err.message));
                        return Promise.reject(new Error('Command Output not supplied!'));
                    }

                    let s = this.addCommand(json, userMessageObj.getDisplayName());

                    //Failed
                    if (s !== true) {
                        this.TwitchIRC.say(userMessageObj.getDisplayName() + " -> Command failed to be created!").catch(err => this.Logger.error(err.message));
                        return Promise.reject(new Error(s));
                    }

                    //Success
                    this.TwitchIRC.say(userMessageObj.getDisplayName() + " -> Command " + name + " created successfully!").catch(err => this.Logger.error(err.message));
                    return Promise.resolve();
                } else if (action === 'edit') {
                    if (cmd_index < 0) {
                        this.TwitchIRC.say(userMessageObj.getDisplayName() + " -> Command " + name + " doesnt exists!").catch(err => this.Logger.error(err.message));
                        return Promise.reject(new Error('Command not found!'));
                    }

                    let s = this.editCommand(json, userMessageObj.getDisplayName());

                    //Failed
                    if (s !== true) {
                        this.TwitchIRC.say(userMessageObj.getDisplayName() + " -> Command failed to be updated!").catch(err => this.Logger.error(err.message));
                        return Promise.reject(new Error(s));
                    }

                    //Success
                    this.TwitchIRC.say(userMessageObj.getDisplayName() + " -> Command " + name + " updated successfully!").catch(err => this.Logger.error(err.message));
                    return Promise.resolve();
                }


                this.TwitchIRC.say(userMessageObj.getDisplayName() + " -> Action " + action + " not supported!").catch(err => this.Logger.error(err.message));
                return Promise.resolve();
            },
                {
                    description: '<p>Used to add/remove/rename/edit Commands. </p><h3>Syntax:</h3><b>!commands <span>action</span> <span>name</span> <span>(option1)</span> <span>(option2)</span> ... <span>(optionN)</span> <span>output</span></b><p><b>action</b> - add, edit, remove or rename</p><p><b>options</b> - Options start with a "-" followed by one of the following identifiers and end with an "=" followed by the value.</b></p><p><b>options identifiers</b>: <ul><li><b>ul</b> - Userlevel (can be any badgename, default: regular)</li><li><b>cd</b> - Cooldown(format: 1s or 5m10s, default: 0s)</li><li><b>dm</b> - Detection Mode(beginning_only_detection (default), inline_detection, multi_detection, multi_inline_detection)</li><li><b>en</b> - enabled (true (default) or false)</li><li><b>sl</b> - strictlevel (0-3 => 0: #ModsMasterrace (default), 1: Badge Mode, 2: Version Mode, 3: Exact Mode)</li><li><b>dc</b> - description</li><li><b>a</b> - Alias can trigger other Commands. Alias Text must be contained in "s. e.g. using alias like : -a="!game Apex Legends" will set the game to Apex Legends without the User having to call !game. Userlevels only apply on the command with the alias! Using the same example: any user can set the game to Apex Legends if no userlevel was set.</li></ul></p><p>e.g. !commands add !hello -ul=moderator -cd=1m $(toUser) - welcome to the stream!</p><b>!commands add <span>[name]</span> <span>(option1)</span> <span>(option2)</span> ... <span>(optionN)</span> <span>[output]</span></b><p>Adds a command. Name and Output are requiered!</p><b>!commands edit <span>[name]</span> <span>(option1)</span> <span>(option2)</span> ... <span>(optionN)</span> <span>(output)</span></b><p>Edits an existing command. Name is requiered! Output is optional!</p><b>!commands remove <span>[name]</span> </b><p>Removes an existing command. Name is requiered!</p><b>!commands rename <span>[currentname]</span> <span>[newname]</span></b><p>Renames an existing command. currentname and newname are requiered!</p>'
                }),
            "!variables": new HCCommand("!variables", async (userMessageObj, parameters) => {
                if (!userMessageObj.matchUserlevel('moderator')) {
                    return Promise.reject(new Error("Not a Moderator!"));
                }

                let action = parameters[1];
                let path = parameters[2];
                let value = parameters.slice(3).join(" ");

                if (action === 'edit') {
                    let value_obj = null;
                    try {
                        value_obj = JSON.parse(value);
                    } catch (err) {
                        this.TwitchIRC.say(userMessageObj.getDisplayName() + " -> Value not in the correct JSON format! Error: " + err.message).catch(err => this.Logger.error(err.message));
                        return Promise.resolve();
                    }

                    let s = this.editCustomVariable(path, value_obj, userMessageObj.getDisplayName());
                    if (s === true) this.TwitchIRC.say(userMessageObj.getDisplayName() + " -> Variable " + path + " successfully editted!").catch(err => this.Logger.error(err.message));
                    else this.TwitchIRC.say(userMessageObj.getDisplayName() + " -> Variable " + path + " failed editting!").catch(err => this.Logger.error(err.message));
                } else if (action === 'remove') {
                    let s = this.removeCustomVariable(path, userMessageObj.getDisplayName());
                    if (s === true) this.TwitchIRC.say(userMessageObj.getDisplayName() + " -> Variable " + path + " successfully removed!").catch(err => this.Logger.error(err.message));
                    else this.TwitchIRC.say(userMessageObj.getDisplayName() + " -> Variable " + path + " failed removing!").catch(err => this.Logger.error(err.message));
                } else {
                    this.TwitchIRC.say(userMessageObj.getDisplayName() + " -> Action " + action + " not supported!").catch(err => this.Logger.error(err.message));
                    return Promise.resolve();
                }

                return Promise.resolve();
            },
                {
                    description: '<p>Used to add/remove/edit Custom Command Variables. </p><h3>Syntax:</h3><b>!variables <span>action</span> <span>path</span> <span>[value]</span></b><p><b>action</b> - edit or remove</p><p><b>path</b> - a JSON formatted path in an object. e.g. User.Name or Users.0.Name</p><p><b>value</b> - Stringified JSON Value e.g. "text here" or 12 or [4, 8, 15, 16, 32, 42]</p><p>e.g. !variables add a.b c</p><b>!variables edit <span>path</span> <span>value</span></b><p>Adds/Edits the object/value at the given path to the given value. Value is requiered. The full path will be created, if needed.</p><b>!variables remove <span>path</span></b><p>Removes the object/value at the given path. Value is not needed!</p>',
                    viewing_restriction: true
                }),
            "!timers": new HCCommand("!variables", async (userMessageObj, parameters) => {
                if (!userMessageObj.matchUserlevel('moderator')) {
                    return Promise.reject(new Error("Not a Moderator!"));
                }
                
                let action = parameters[1];
                let name = parameters[2];
                let interval = parameters[3];

                let options = [];
                let output = "";
                const identifiers = {
                    'en': { trans: 'enabled', func: (x) => x == 'true' || x == 'false' ? x == 'true' : null },
                    'dc': { trans: 'description', func: (x) => x },
                    'a': {
                        trans: 'alias', func: (x, start) => {
                            let str = x + " " + parameters.slice(start + 1).join(" ");
                            return str.substring(str.indexOf('"') + 1, str.lastIndexOf('"'));
                        }
                    }
                };

                //Collect Data
                for (let i = 4; i < parameters.length; i++) {
                    if (parameters[i].charAt(0) === '-') {
                        options.push({ name: parameters[i].substring(1, parameters[i].indexOf('=')), value: parameters[i].substring(parameters[i].indexOf('=') + 1), start: i });
                    } else {
                        output = parameters.slice(i).join(" ");
                        break;
                    }
                }
                
                //Create new/updated Data
                let json = { name, output, interval };
                for (let opt of options) {
                    if (identifiers[opt.name] === undefined) {
                        this.TwitchIRC.say(userMessageObj.getDisplayName() + " -> Timer could not be created/updated - Issue: Unsupported identifier " + opt.name).catch(err => this.Logger.error(err.message));
                        return Promise.reject(new Error('Timer Options wrong!'));
                    }

                    let result = identifiers[opt.name].func(opt.value, opt.start);
                    if (result === undefined || result === null) {
                        this.TwitchIRC.say(userMessageObj.getDisplayName() + " -> Timer could not be created/updated - Issue: Wrong Format or Value of " + identifiers[opt.name].trans).catch(err => this.Logger.error(err.message));
                        return Promise.reject(new Error('Timer Options wrong!'));
                    }
                    json[identifiers[opt.name].trans] = result;
                }
                
                if (json.alias) delete json.output;
                
                if (action === 'add') {
                    let s = this.addTimer(json, userMessageObj.getDisplayName());
                    if (s === true) this.TwitchIRC.say(userMessageObj.getDisplayName() + " -> Timer " + name + " successfully added!").catch(err => this.Logger.error(err.message));
                    else this.TwitchIRC.say(userMessageObj.getDisplayName() + " -> Timer " + name + " failed to be added! Error: " + s).catch(err => this.Logger.error(err.message));
                } else if (action === 'remove') {
                    let s = this.removeTimer(name, userMessageObj.getDisplayName());
                    if (s === true) this.TwitchIRC.say(userMessageObj.getDisplayName() + " -> Timer " + name + " successfully removed!").catch(err => this.Logger.error(err.message));
                    else this.TwitchIRC.say(userMessageObj.getDisplayName() + " -> Timer " + name + " failed removing! Error: " + s).catch(err => this.Logger.error(err.message));
                } else if (action === 'start') {
                    let s = this.startTimer(name);
                    if (s === true) this.TwitchIRC.say(userMessageObj.getDisplayName() + " -> Timer " + name + " started!").catch(err => this.Logger.error(err.message));
                    else this.TwitchIRC.say(userMessageObj.getDisplayName() + " -> Timer " + name + " failed starting! Error: " + s).catch(err => this.Logger.error(err.message));
                } else if (action === 'stop') {
                    let s = this.stopTimer(name);
                    if (s === true) this.TwitchIRC.say(userMessageObj.getDisplayName() + " -> Timer " + name + " stopped!").catch(err => this.Logger.error(err.message));
                    else this.TwitchIRC.say(userMessageObj.getDisplayName() + " -> Timer " + name + " failed stopping! Error: " + s).catch(err => this.Logger.error(err.message));
                } else {
                    this.TwitchIRC.say(userMessageObj.getDisplayName() + " -> Action " + action + " not supported!").catch(err => this.Logger.error(err.message));
                }

                return Promise.resolve();
            },
                {
                    description: '<p>Used to add/remove/edit/start/stop Timers. </p><h3>Syntax:</h3><b>!timers <span>action</span> <span>interval</span> <span>(option1)</span> <span>(option2)</span> ... <span>(optionN)</span> <span>[output]</span></b><p><b>action</b> - edit or remove</p><b>interval</b> - string code containing the interval time e.g. 1m , 50s or 1h2m10s</p><b>options</b> - Options start with a "-" followed by one of the following identifiers and end with an "=" followed by the value.</b></p><p><b>options identifiers</b>: <ul><li><b>en</b> - enabled (true (default) or false)</li><li><b>dc</b> - description</li><li><b>a</b> - Alias can trigger other Commands. Alias Text must be contained in "s. e.g. using alias like : -a="!game Apex Legends" will set the game to Apex Legends without the User having to call !game. Userlevels only apply on the command with the alias! Using the same example: any user can set the game to Apex Legends if no userlevel was set.</li></ul></p><p><b>output</b> - Text to be sent when interval is over. Is not needed/overwritten when using an alias!</p>',
                    viewing_restriction: true
                }),
            "!watchtime": new HCCommand("!watchtime", async (userMessageObj, parameters) => {
                //Fetch Users
                let user;

                try {
                    user = await this.WatchTimeDB.findOne({ user_login: userMessageObj.getLoginName() });
                } catch (err) {
                    this.TwitchIRC.reply(userMessageObj.getID(), 'Database Error!', userMessageObj.getChannel()).catch(err => this.Logger.error(err.message));
                    return Promise.reject(err);
                }

                //Not Found
                if (!user) {
                    this.TwitchIRC.reply(userMessageObj.getID(), 'Your Watchtime hasent been tracked yet! Wait a few minutes and try again!', userMessageObj.getChannel()).catch(err => this.Logger.error(err.message));
                    return Promise.reject(err);
                }

                //Print Watchtime
                let s = "You have been watching for ";

                let h = Math.floor(user.count / 60);
                let m = user.count - h * 60;

                if (h > 0) s += h + ' hours and ';
                s += m + ' minutes!';

                this.TwitchIRC.reply(userMessageObj.getID(), s, userMessageObj.getChannel()).catch(err => this.Logger.error(err.message));
                return Promise.resolve();
            },
                {
                    description: '<p>Used to fetch your Watchtime. </p>'
                }),
            "!v": new HCCommand("!v", async (userMessageObj, parameters) => {
                if (userMessageObj.matchUserlevel('moderator')) return Promise.resolve();

                try {
                    await this.TwitchAPI.BanUser(
                        { broadcaster_id: userMessageObj.getRoomID(), moderator_id: this.TwitchIRC.getUserID() },
                        { user_id: userMessageObj.getUserID(), duration: 1, reason: '!v Command triggered successfully' }
                    );
                } catch (err) {
                    console.log(err);
                }
                return Promise.resolve();
            },
                {
                    description: '<p>Timesout the user for 1s. (Deleting all messages)</p>'
                })
        };

        for (let cmd in this.HardcodedCommands) {
            if (cfg['disabled_hccommands'].find(elt => elt === this.HardcodedCommands[cmd].getName())) {
                this.HardcodedCommands[cmd].setEnable(false);
            }
        }

        for (let rename of cfg['renamed_hccommands']) {
            let orig_name = rename.split('-')[0];
            let new_name = rename.split('-')[1];
            this.renameHardCoded(orig_name, new_name, 'Init');
        }

        this.CommandVariables = {
            "Arguments": new Variable("Arguments",
                {
                    "description": "The arguments variables print arguments split by spaces after a command. This is primarily useful when used within nested commands. <h3>Enhanced Usage</h3><p>You can use more than just 1-9!</p><p>$(<span>integer</span> \"<span>Default</span>\")</p><p>Default - is printed when no arguments are given after calling the command</p>",
                    "Nightbot": { "version": "22nd Oct 2020", "enhanced": true }
                }, async (variableString, userMessageObj, commandOrig, parameters) => {
                    let variable_params = variableString.substring(2, variableString.length - 1).split(" ");
                    if (isNaN(variable_params[0])) return Promise.reject(new Error("Wrong Format!"));

                    let number = parseInt(variable_params[0]);
                    if (number < 1) return Promise.reject(new Error("Wrong Argument!"));

                    if (parameters.length >= number + 1) return Promise.resolve(parameters[number]);
                    else if (variable_params.length > 1) return Promise.resolve(variable_params[1]);
                    else return Promise.reject(new Error("No Arguments given!"));
                }),
            "channel": new Variable("Channel", {
                "description": "The channel variable just prints the current channel. <h3>Enhanced Usage</h3><p>$(<span>channel</span> \"<span>Capitalised</span>\")</p><p>Capitalised - when set to true, channel name will print the display name of the channel</p>",
                "Nightbot": { "version": "22nd Oct 2020", "enhanced": true }
            }, async (variableString, userMessageObj, commandOrig, parameters) => {
                let variable_params = variableString.substring(2, variableString.length - 1).split(" ");
                let channel = userMessageObj.getChannel().substring(1);

                //Fetch Display Name
                try {
                    if (variable_params[1] == "true") {
                        let response = await this.TwitchAPI.GetUsers({ login: channel });
                        channel = response.data[0]["display_name"];
                    }
                } catch (err) {

                }
                
                return Promise.resolve(channel);
            }),
            "count": new Variable("Count", {
                "description": "The count variable prints how many times a command has been used. <h3>Enhanced Usage</h3><p>$(<span>count</span> \"<span>preload</span>\" \"<span>steps</span>\")</p><p>preload - Set a value to increment from. (e.g. start counting from 10 instread of 0)</p><p>steps - Set a value to increment the count by, yes even negative. (e.g. add 5 on every command call)</p>",
                "Nightbot": { "version": "22nd Oct 2020", "enhanced": true }
            }, async (variableString, userMessageObj, commandOrig, parameters) => {
                let variable_params = variableString.substring(2, variableString.length - 1).split(" ");
                let new_value = 0;
                let inc = 1;

                //Find Command
                let idx = -1;
                this.CustomCommands.find((elt, index) => {
                    if (elt.name === commandOrig.name) {
                        idx = index;
                        return true;
                    }
                    return false;
                });

                //Preload / Increment
                if(idx >= 0 && this.CustomCommands[idx].counter !== undefined) new_value = this.CustomCommands[idx].counter;
                else if (variable_params.length > 2) new_value = parseInt(variable_params[2]);
                if (variable_params.length > 1) inc = parseInt(variable_params[1]);

                //Add
                new_value += inc;

                //Store
                if (idx >= 0) this.CustomCommands[idx].counter = new_value;
                this.saveCommands();
                
                return Promise.resolve(new_value);
            }),
            "countdown": new Variable("Countdown", {
                "description": "You can use the countdown variable to create commands that display the time left until a specified date. For example, you may want to countdown until a special event on stream, or until when the stream will start every day.",
                "Nightbot": { "version": "22nd Oct 2020" }
            }, async (variableString, userMessageObj, commandOrig, parameters) => {
                let cfg = this.Config.GetConfig();

                let time = variableString.substring(12, variableString.length - 1);
                let date = new Date(time);
                let rel = 0;
                let autocomplete = false;
                
                try {
                    date.getTime(); //CHECKS VALID DATE
                } catch (err) {
                    date = new Date(new Date().toLocaleDateString(cfg['timezone'] === "" ? undefined : cfg['timezone']) + " " + time);
                    autocomplete = true;
                }

                try {
                    rel = Date.now() - date.getTime();
                    if (autocomplete && rel > 0) {
                        let temp_date = new Date();
                        temp_date.setDate(temp_date.getDate() + 1);
                        date = new Date(temp_date.toLocaleDateString(cfg['timezone'] === "" ? undefined : cfg['timezone']) + " " + time);
                        rel = Date.now() - date.getTime();
                    }
                } catch (err) {
                    return Promise.reject(err);
                }
                if (rel > 0) return Promise.reject(new Error('Time is in the past!'));
                
                return Promise.resolve(this.getRelativeTimeString(Date.now() + rel));
            }),
            "countup": new Variable("Countup", {
                "description": "You can use the countup variable to create commands that display the time since a specified date. For example, maybe you want to countup from a special event that happened on your stream.",
                "Nightbot": { "version": "22nd Oct 2020" }
            }, async (variableString, userMessageObj, commandOrig, parameters) => {
                let cfg = this.Config.GetConfig();

                let time = variableString.substring(10, variableString.length - 1);
                let date = new Date(time);
                let rel = 0;
                let autocomplete = false;
                
                try {
                    date.getTime(); //CHECKS VALID DATE
                } catch (err) {
                    date = new Date(new Date().toLocaleDateString(cfg['timezone'] === "" ? undefined : cfg['timezone']) + " " + time);
                    autocomplete = true;
                }

                try {
                    rel = Date.now() - date.getTime();
                    if (autocomplete && rel < 0) {
                        let temp_date = new Date();
                        temp_date.setDate(temp_date.getDate() - 1);
                        date = new Date(temp_date.toLocaleDateString(cfg['timezone'] === "" ? undefined : cfg['timezone']) + " " + time);
                        rel = Date.now() - date.getTime();
                    }
                } catch (err) {
                    return Promise.reject(err);
                }
                if (rel < 0) return Promise.reject(new Error('Time is in the future!'));
                return Promise.resolve(this.getRelativeTimeString(rel));
            }),
            "query": new Variable("Query", {
                "description": "The query variable prints anything a user types after a command. This is useful when combined with other variables that accept parameters.",
                "Nightbot": { "version": "22nd Oct 2020" }
            }, async (variableString, userMessageObj, commandOrig, parameters, start) => {
                return Promise.resolve(userMessageObj.message.substring(start + commandOrig.name.length + 1));
            }),
            "querystring": new Variable("QueryString", {
                "description": "The querystring variable prints a url-encoded string of the user's text after a command. This is useful when combined with the urlfetch variable in cases where data is being passed to a server via querystring.",
                "Nightbot": { "version": "22nd Oct 2020" }
            }, async (variableString, userMessageObj, commandOrig, parameters, start) => {
                let message = variableString.substring(13, variableString.length - 1);
                if (!message) message = userMessageObj.message.substring(start + commandOrig.name.length + 1);
                return Promise.resolve(encodeURI(message));
            }),
            "random": new Variable("Random", {
                "description": "This Variable generates a random integer number from 0 to 10.<p>$(<span>random</span>)</p><p>$(<span>random</span> \"<span>min</span>\" \"<span>max</span>\")</p><p>min - minimum of the random numbers</p><p>max - maximum of the random numbers</p>",
                "FrikyBot": { "version": "30th June 2021" }
            }, async (variableString, userMessageObj, commandOrig, parameters) => {
                let min = 0;
                let max = 10;
                let variable_params = variableString.substring(2, variableString.length - 1).split(" ");

                if (variable_params.length > 1) min = parseInt(variable_params[1]);
                if (variable_params.length > 2) max = parseInt(variable_params[2]);

                max = max - min;

                return Promise.resolve(Math.floor(Math.random() * max + min) + "");
            }),
            "owrankname": new Variable("OWRankName", {
                "description": "<p>The OWRankName Variable prints the RankName of a given Skill Rating.</p><h3>Usage</h3><p>$(owrankname <span>SR</span>)</p><p>SR - integer Skill Rating</p>",
                "FrikyBot": { "version": "30 June 2021" }
            }, async (variableString, userMessageObj, commandOrig, parameters) => {

                try {
                    let SR = parseInt(variableString.substring(variableString.indexOf(" ") + 1, variableString.length - 1));

                    if (SR == 0) return Promise.resolve("No Rank");
                    else if (SR < 1500) return Promise.resolve("Bronze");
                    else if (SR < 2000) return Promise.resolve("Silver");
                    else if (SR < 2500) return Promise.resolve("Gold");
                    else if (SR < 3000) return Promise.resolve("Platin");
                    else if (SR < 3500) return Promise.resolve("Diamond");
                    else if (SR < 4000) return Promise.resolve("Master");
                    else if (SR < 5000) return Promise.resolve("Grandmaster");
                    else return Promise.resolve("No Rank");
                } catch (err) {
                    return Promise.resolve("No Rank");
                }
            }),
            "time": new Variable("Time", {
                "description": "The time variable prints the current time in a selected timezone. (WARNING: Only Javascript native Timezones/Formats are currently supported <a href='https://www.iana.org/time-zones'>visit</a>)",
                "Nightbot": { "version": "22nd Oct 2020" }
            }, async (variableString, userMessageObj, commandOrig, parameters) => {
                let cfg = this.Config.GetConfig();

                let variable_params = variableString.substring(2, variableString.length - 1).split(" ");
                let options = {};

                if (variable_params.length > 1) options.timeZone = variable_params[1];
                if (variable_params.length > 2) options.timeZone = variable_params[2];

                let today = new Date();

                try {
                    return Promise.resolve(today.toLocaleDateString(cfg['timezone'] === "" ? "de-DE" : cfg['timezone'], options) + " " + today.toLocaleTimeString(cfg['timezone'] === "" ? "de-DE" : cfg['timezone'], options));
                } catch (err) {
                    return Promise.reject(err);
                }
            }),
            "touser": new Variable("ToUser", {
                "description": "The touser variable just prints the first argument given to a command.",
                "Nightbot": { "version": "22nd Oct 2020" }
            }, async (variableString, userMessageObj, commandOrig, parameters) => {
                if (parameters.length > 1) return Promise.resolve(parameters[1]);
                else return Promise.resolve(userMessageObj.getDisplayName());
            }),
            "2user": new Variable("2User", {
                "description": "The 2user variable is an advanced version of the Nightbot toUser variable. Mods are not tagged, when they call it for nobody else!",
                "FrikyBot": { "version": "30th June 2021" }
            }, async (variableString, userMessageObj, commandOrig, parameters) => {
                if (parameters.length == 1 && userMessageObj.matchUserlevel('moderator')) return Promise.resolve("");
                else if (parameters.length > 1) return Promise.resolve(parameters[1]);
                else return Promise.resolve(userMessageObj.getDisplayName());
            }),
            "twitch": new Variable("Twitch", {
                "description": "You can use the Twitch variable to display various profile information about a specific Twitch account. (WARNING: Due to the New Twitch API Endpoints for fps and resolution informations are not available) <h3>Enhanced Usage</h3><p>$(<span>twitch </span> <span>username</span> \"<span>formatted string</span>\")</p><p>delay - prints the stream delay set by the broadcaster</p><p>emotes - prints all emotes of this channel</p><p>emotes_t1 - prints all T1 emotes of this channel</p><p>emotes_t2 - prints all T2 emotes of this channel</p><p>emotes_t3 - prints all T3 emotes of this channel</p><p>emotes_bits - prints all Bits emotes of this channel</p><p>emotes_follow - prints all follower emotes of this channel</p>",
                "Nightbot": { "version": "22nd Oct 2020", "enhanced": true },
                api_requierements: [{ subscriberCount: 'channel:read:subscriptions' }]
            }, async (variableString, userMessageObj, commandOrig, parameters) => {
                let variable_params = variableString.substring(2, variableString.length - 1).split(" ");
                let username = variable_params[1];
                let formatedString = variableString.substring(variableString.indexOf('"') + 1, variableString.indexOf('"', variableString.indexOf('"') + 1));
                let vars = this.getFormatedStringVariables(formatedString);

                let UserData = null;
                let StreamsData = null;
                let ChannelData = null;
                let FollowData = null;
                let TagData = null;
                let SubData = null;
                let EmoteData = null;

                const localization_name = "en-US";
                const user_date_options = { year: 'numeric', month: 'numeric', day: 'numeric' };
                const stream_date_options = { year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' };
                const string_vars_info = [
                    { name: 'name', func: () => username },
                    { name: 'url', func: () => "https://www.twitch.tv/" + username },
                    { name: 'displayName', req_user: true, func: () => UserData.display_name },
                    { name: 'status', req_stream: true, func: () => StreamsData ? 'online' : 'offline' },
                    { name: 'title', req_channel: true, func: () => ChannelData.title },
                    { name: 'game', req_channel: true, func: () => ChannelData.game_name },
                    { name: 'delay', req_channel: true, func: () => ChannelData.delay + "s" },
                    { name: 'tags', req_tags: true, func: () => {
                            let outp = '';
                            for (let tag of TagData || []) {
                                let tagename = tag.localization_names[localization_name.toLocaleLowerCase()];
                                if (!tagename) tagename = tag.localization_names['en-us'];
                                outp += ', ' + tagename;
                            }
                            return outp.length > 0 ? outp.substring(2) : outp;
                        } },
                    { name: 'createdAt', req_user: true, func: () => new Date(UserData.created_at).toLocaleDateString(localization_name, user_date_options) },
                    { name: 'createdLength', req_user: true, func: () => this.getRelativeTimeString(new Date(UserData.created_at).getTime(), true) },
                    { name: 'viewers', req_stream: true, func: () => StreamsData.viewer_count },
                    { name: 'views', req_user: true, func: () => UserData.view_count },
                    { name: 'followers', req_follow: true, func: () => FollowData.total },
                    { name: 'uptimeAt', req_stream: true, func: () => new Date(StreamsData.started_at).toLocaleDateString(localization_name, stream_date_options) },
                    { name: 'uptimeLength', req_stream: true, func: () => this.getRelativeTimeString(new Date(StreamsData.started_at).getTime()) },
                    { name: 'subscriberCount', req_sub: true, func: () => SubData.total },
                    { name: 'emotes', req_emote: true, func: () => {
                            let t1 = "";
                            let t2 = "";
                            let t3 = "";
                            let bits = "";
                            let follow = "";
                            let unknown = "";

                            for (let emote of EmoteData) {
                                if (emote.emote_type == 'subscriptions') {
                                    if (emote.tier === '1000') t1 += ' ' + emote.name;
                                    else if (emote.tier === '2000') t2 += ' ' + emote.name;
                                    else if (emote.tier === '3000') t3 += ' ' + emote.name;
                                } else if (emote.emote_type == 'bitstier') bits += ' ' + emote.name;
                                else if (emote.emote_type == 'follower') follow += ' ' + emote.name;
                                else unknown += ' ' + emote.name;
                            }

                            return "T1: " + (t1 || 'NONE') + " T2: " + (t2 || 'NONE') + " T3: " + (t3 || 'NONE') + " Bits: " + (bits || 'NONE') + " Follow: " + (follow || 'NONE') + (unknown ? " Unknown Origin: " + unknown : '');
                    } },
                    { name: 'emotes_t1', req_emote: true, func: () => {
                            let t1 = "";

                            for (let emote of EmoteData) {
                                if (emote.emote_type == 'subscriptions' && emote.tier === '1000') {
                                    t1 += ' ' + emote.name;
                                }
                            }

                            return t1 || 'NONE';
                    } },
                    { name: 'emotes_t2', req_emote: true, func: () => {
                            let t2 = "";

                            for (let emote of EmoteData) {
                                if (emote.emote_type == 'subscriptions' && emote.tier === '2000') {
                                    t2 += ' ' + emote.name;
                                }
                            }

                            return t2 || 'NONE';
                        } },
                    { name: 'emotes_t3', req_emote: true, func: () => {
                            let t3 = "";

                            for (let emote of EmoteData) {
                                if (emote.emote_type == 'subscriptions' && emote.tier === '3000') {
                                    t3 += ' ' + emote.name;
                                }
                            }

                            return t3 || 'NONE';
                        } },
                    { name: 'emotes_bits', req_emote: true, func: () => {
                            let bits = "";

                            for (let emote of EmoteData) {
                                if (emote.emote_type == 'bitstier') bits += ' ' + emote.name;
                            }

                            return bits || 'NONE';
                        } },
                    { name: 'emotes_follow', req_emote: true, func: () => {
                            let follow = "";

                            for (let emote of EmoteData) {
                                if (emote.emote_type == 'follower') follow += ' ' + emote.name;
                            }

                            return follow || 'NONE';
                        } }
                ];
                
                if (variable_params.length < 2) {
                    return Promise.reject(new Error('Username not supplied!'));
                } else if (variable_params.length == 2) {
                    StreamsData = await this.TwitchAPI.GetStreams({ user_login: username });
                    if (StreamsData.data && StreamsData.data.length > 0) {
                        formatedString = "{{displayName}} is currently {{status}} playing {{game}} with {{viewers}} viewers since {{uptimeAt}} ({{uptimeLength}}) - {{url}}";
                    } else {
                        formatedString = "{{displayName}} is currently {{status}} - {{url}}";
                    }
                    vars = this.getFormatedStringVariables(formatedString);
                }
                
                let output = "";
                let last = 0;
                for (let vari of vars) {
                    let content = "-";
                    let string_var = string_vars_info.find(elt => elt.name === vari.name);
                    if (string_var) {
                        try {
                            if ((string_var.req_user || string_var.req_sub || string_var.req_channel || string_var.req_tags || string_var.req_follow || string_var.req_emote) && !UserData) UserData = (await this.TwitchAPI.GetUsers({ login: username })).data[0];
                            if ((string_var.req_stream) && !StreamsData) StreamsData = (await this.TwitchAPI.GetStreams({ user_login: username })).data[0];

                            if (string_var.req_tags && !TagData) TagData = (await this.TwitchAPI.GetStreamTags({ broadcaster_id: UserData.id })).data;
                            if (string_var.req_sub && !SubData) SubData = (await this.TwitchAPI.GetBroadcasterSubscriptions({ broadcaster_id: UserData.id }));
                            if (string_var.req_channel && !ChannelData) ChannelData = (await this.TwitchAPI.GetChannelInformation({ broadcaster_id: UserData.id })).data[0];
                            if (string_var.req_follow && !FollowData) FollowData = await this.TwitchAPI.GetUsersFollows({ to_id: UserData.id });
                            if (string_var.req_emote && !EmoteData) EmoteData = (await this.TwitchAPI.GetChannelEmotes({ broadcaster_id: UserData.id })).data;

                            content = string_var.func() || '-';
                        } catch (err) {

                        }
                    }

                    output += formatedString.substring(last, vari.pos) + content;
                    last = vari.end + 2;
                }
                return Promise.resolve(output + formatedString.substring(last));
                }),
            "urlfetch": new Variable("UrlFetch", {
                "description": "The urlfetch (formerly customapi) variable calls a remote url to retrieve and display a response. It's useful for building more complex commands that Nightbot ['/ FrikyBot'] does not support. WARNING: FrikyBot has currently no API to send messages! <h3>Advanced Usage Change</h3><p>$(<span>urlfetch </span> <span>json_path</span> <span>url</span>)</p><p>json_path - Path to a value inside a JSON Object (e.g. JSON-PAYLOAD: { a:  { b: [{ c: 'd' }] } } and path: a.b[0].c would return 'd')</p>",
                "Nightbot": { "version": "22nd Oct 2020", "enhanced": true }
            }, async (variableString, userMessageObj, commandOrig, parameters) => {
                let variable_params = variableString.substring(2, variableString.length - 1).split(" ");
                let url = variable_params[variable_params.length - 1];

                const options = {
                    method: 'GET',
                    headers: {
                        'FrikyBot-User': JSON.stringify(userMessageObj.getUser()),
                        'FrikyBot-Channel': userMessageObj.getChannel(),
                        'FrikyBot-Message': userMessageObj.getMessage()
                    }
                };

                return FETCH(url, options)
                    .then(data => data.text())
                    .then(text => {
                        if (variable_params.length > 2) {
                            try {
                                let json = JSON.parse(text);
                                return Promise.resolve(this.getObjectFromPath(json, variable_params[1]));
                            } catch (err) {
                                return Promise.resolve('{JSON ERROR}');
                            }
                        }
                        return Promise.resolve(text.substring(0, 400));
                    });
                }),
            "user": new Variable("User", {
                "description": "The user variable prints the name of the user calling the command.",
                "Nightbot": { "version": "22nd Oct 2020" }
            }, async (variableString, userMessageObj, commandOrig, parameters) => {
                return userMessageObj.getUsername();
            }),
            "userid": new Variable("UserID", {
                "description": "UserID can be used to show the particular user's ID when used within [Twitch].",
                "Nightbot": { "version": "22nd Oct 2020" }
            }, async (variableString, userMessageObj, commandOrig, parameters) => {
                return Promise.resolve(userMessageObj.getUserID());
            }),
            "userlevel": new Variable("UserLevel", {
                "description": "The userlevel variable prints the userlevel of the user calling the command. (These are different from nightbot as they are bound to the equipped badges: broadcaster, admin, staff, global_mod, moderator, vip, founder, subscriber, partner, other, follower, regular)",
                "Nightbot": { "version": "22nd Oct 2020" }
            }, async (variableString, userMessageObj, commandOrig, parameters) => {
                return Promise.resolve(userMessageObj.getUserLevelAsText());
            }),
            "Custom": new Variable("Variable", {
                "description": "<p>Custom Variables, set using the !variables command, can be used by entering a JSON-Path. This is very usefull for changing and complex Datastructures.</p><h3>Usage</h3><p>$(<span>Variable Name/Path</span>)</p><h3>Variable Name</h3><p>e.g. $(LastUser) - Prints the Value behind '{ LastUser: \"value\" }'.</p><h3>Variable Path</h3><p>e.g. $(LastUser.Name) - Prints the Value behind '{ LastUser: { Name: \"value\" } }'.</p><p>e.g. $(LastUser.0) - Prints the Value 1 behind '{ LastUser: [\"value 1\", \"value 2\"] }'.</p>",
                "FrikyBot": { "version": "22nd Oct 2020" }
            }, async (variableString, userMessageObj, commandOrig, parameters) => {
                let variable_params = variableString.substring(2, variableString.length - 1).split(" ");
                let result = this.getObjectFromPath(this.CustomVariables, variable_params[0]);
                return Promise.resolve(result || '-');
            })
        };

        //TwitchIRC Capability
        if (this.TwitchIRC) this.TwitchIRC.on('chat', async (channel, user_login, message, tags, self) => {
            if (!this.isEnabled()) return Promise.resolve();

            let messageObj = new TWITCHIRC.Message(channel, user_login, message, tags);
            let cfg = this.GetConfig();

            //Update Timers
            for (let timer of this.ActiveTimers) {
                //Update Lines for Timers
                timer.lines++;
            }
            
            //Find Commands
            try {
                if (!self) {
                    //Check Follow UserLevel
                    if (!messageObj.matchUserlevel(CONSTANTS.UserLevel["follower"] + 1)) {
                        await messageObj.checkFollow(this.TwitchAPI);
                    }

                    let succesfull = await this.CommandHandler(messageObj);

                    if (cfg['command_timer_reset'] !== true) return Promise.resolve();

                    //Update Timers
                    for (let timer of this.ActiveTimers) {
                        let obj_timer = this.Timers.find(elt => elt.name === timer.name);
                        let alias = (obj_timer.alias || '').split(" ")[0];
                        
                        //Reset Timers when command called
                        if (succesfull.find(elt => elt.name === alias)) {
                            this.resetTimer(timer.name);
                        }
                    }
                }
            } catch (err) {
                this.TwitchIRC.Logger.error(err.message);
            }
        });

        //TwitchAPI EventSubs
        this.TwitchAPI.AddEventSubCallback('stream.online', this.getName(), (body) => this.EventSub_Online(body));
        this.TwitchAPI.AddEventSubCallback('stream.offline', this.getName(), (body) => this.EventSub_Offline(body));
        this.TwitchAPI.AddEventSubCallback('channel.update', this.getName(), (body) => this.EventSub_Update(body));

        //STATIC FILE ROUTING
        let StaticRouter = express.Router();
        StaticRouter.use((req, res, next) => {
            if (req.url == "/variables") {
                res.sendFile(path.resolve("Packages/CommandHandler/html/variables.html"));
            } else {
                let page = this.HTMLFileExists(req.url);
                //Check if File/Dir is Present
                if (page != "") {
                    res.sendFile(page);
                } else {
                    next();
                }
            }
        });
        super.setFileRouter(StaticRouter);

        //Public API ENDPOINTS
        let APIRouter = express.Router();
        APIRouter.get('/commands', async (req, res, next) => {
            let custom_commands = [];
            let hardcoded_commands = {};
            let authenticated = false;

            try {
                await this.WebAppInteractor.AuthorizeUser(res.locals.user, { user_level: 'moderator' });
                authenticated = true;
            } catch (err) {

            }

            //Custom
            for (let cmd of this.CustomCommands) {
                if (authenticated || (cmd.enabled === true && cmd.viewing_restriction === false)) custom_commands.push(cmd);
            }

            //Hardcoded
            for (let cmd in this.HardcodedCommands) {
                let cmd_obj = this.HardcodedCommands[cmd];
                if (authenticated || (cmd_obj.isEnabled() && !cmd_obj.isViewingRestricted())) hardcoded_commands[cmd] = cmd_obj.toJSON();
            }

            return Promise.resolve(res.json({ Custom: custom_commands, Hardcoded: hardcoded_commands }));
        });
        APIRouter.get('/variables', async (req, res, next) => {
            let data = {};
            let authenticated = false;

            try {
                await this.WebAppInteractor.AuthorizeUser(res.locals.user, { user_level: 'moderator' });
                authenticated = true;
            } catch (err) {

            }

            //Authentication used?
            if (authenticated) {
                for (let name in this.CommandVariables) {
                    data[name] = this.CommandVariables[name].getExtendedDetails();
                }
            } else {
                for (let name in this.CommandVariables) {
                    if (this.CommandVariables[name].isEnabled())
                        data[name] = this.CommandVariables[name].getDetails();
                }
            }

            return Promise.resolve(res.json({ variables: data }));
        });
        APIRouter.get('/oncooldown', (req, res, next) => {
            res.json({ onCooldown: this.onCooldown });
        });
        APIRouter.get('/page', async (req, res, next) => {
            let custom_commands = [];
            let hardcoded_commands = {};
            let authenticated = false;

            try {
                await this.WebAppInteractor.AuthorizeUser(res.locals.user, { user_level: 'moderator' });
                authenticated = true;
            } catch (err) {

            }

            //Commands
            for (let cmd of this.CustomCommands) {
                if (authenticated || (cmd.enabled === true && cmd.viewing_restriction === false)) custom_commands.push(cmd);
            }

            for (let cmd in this.HardcodedCommands) {
                let cmd_obj = this.HardcodedCommands[cmd];
                if (authenticated || (cmd_obj.isEnabled() && !cmd_obj.isViewingRestricted())) hardcoded_commands[cmd] = cmd_obj.toJSON();
            }

            //Timers
            let act_timers = [];
            if (authenticated) {
                for (let tmr of this.ActiveTimers) {
                    let temp_tmr = {};
                    for (let key in tmr) {
                        if (key !== 'interval') temp_tmr[key] = tmr[key];
                    }
                    act_timers.push(temp_tmr);
                }
            }

            let timers = [];
            for (let tmr of this.Timers) {
                if (authenticated || (tmr.enabled === true && tmr.viewing_restriction === false)) {
                    timers.push(tmr);
                }
            }

            //Variables
            let variables = [];
            if (authenticated) {
                for (let vari in this.CommandVariables) {
                    variables.push(this.CommandVariables[vari].getExtendedDetails());
                }
            }
            
            return Promise.resolve(res.json({
                Custom: custom_commands,
                Hardcoded: hardcoded_commands,
                onCooldown: this.onCooldown,
                Timers: timers,
                ActiveTimers: act_timers,
                scopes: authenticated ? this.TwitchAPI.GetScopes() : [],
                variables: variables,
                custom_variables: authenticated ? this.CustomVariables : null
            }));
        });
        this.setAuthenticatedAPIRouter(APIRouter, { user_level: () => this.Config.GetConfig()['website_userlevel'] });

        //Authenticated API ENDPOINTS
        let AuthAPIRouter = express.Router();
        AuthAPIRouter.route('/commands')
            .post((req, res, next) => {
                let s = this.addCommand(req.body.command, (res.locals.user || {}).preferred_username);
                if (s === true) res.json({ data: "Command: " + req.body.command.name + " CREATED!" });
                else res.json({ err: s });
            })
            .put((req, res, next) => {
                let s = this.editCommand(req.body.command, (res.locals.user || {}).preferred_username);
                if (s === true) res.json({ data: "Command: " + req.body.command.name + " UPDATED!" });
                else res.json({ err: s });
            })
            .move((req, res, next) => {
                let s = this.renameCommand(req.body.oldname, req.body.newname, (res.locals.user || {}).preferred_username);
                if (s === true) res.json({ data: "Command: " + req.body.oldname + " RENAMED!" });
                else res.json({ err: s });
            })
            .delete((req, res, next) => {
                let s = this.removeCommand(req.body.name, (res.locals.user || {}).preferred_username);
                if (s === true) res.json({ data: "Command: " + req.body.name + " REMOVED!" });
                else res.json({ err: s });
            });
        
        AuthAPIRouter.route('/hccommands')
            .put((req, res, next) => {
                let command = this.HardcodedCommands[req.body['name']];
                if (!command) return res.sendStatus(404);
                command.setEnable(req.body['state'] === undefined ? req.body['state'] : !command.isEnabled());

                let new_disabled = cfg['disabled_hccommands'];

                if (command.isEnabled()) {
                    new_disabled = new_disabled.filter(elt => elt !== command.getName());
                } else if (!new_disabled.find(elt => elt === command.getName())) {
                    new_disabled.push(command.getName());
                }

                let error = this.Config.UpdateSetting('disabled_hccommands', new_disabled);
                if (error !== true) return res.json({ err: error });
                res.sendStatus(200);
            })
            .move((req, res, next) => {
                let s = this.renameHardCoded(req.body.orig_name, req.body.new_name, (res.locals.user || {}).preferred_username);

                if (s !== true) return res.json({ err: s });

                let renamed = this.Config.GetConfig()['renamed_hccommands'];

                let idx = -1;
                renamed.find((elt, index) => {
                    if (elt.startsWith(req.body.orig_name + '-')) {
                        idx = index;
                        return true;
                    }
                    return false;
                });

                if (idx > -1) renamed.splice(idx, 1);
                renamed.push(req.body.orig_name + '-' + req.body.new_name);

                this.Config.UpdateSetting('renamed_hccommands', renamed);
                res.json({ data: "HC Command: " + req.body.orig_name + " RENAMED!" });
            });

        AuthAPIRouter.route('/variables/custom')
            .get((req, res, next) => {
                res.json(this.CustomVariables);
            })
            .put((req, res, next) => {
                let s = this.editCustomVariable(req.body.path, req.body.data, (res.locals.user || {}).preferred_username);
                if (s === true) res.sendStatus(200);
                else res.json({ err: s });
            })
            .delete((req, res, next) => {
                let s = this.removeCustomVariable(req.body.path, (res.locals.user || {}).preferred_username);
                if (s === true) res.sendStatus(200);
                else res.json({ err: s });
            });

        AuthAPIRouter.route('/timers')
            .get((req, res, next) => {
                let temp = [];

                for (let tmr of this.ActiveTimers) {
                    let temp_tmr = {};
                    for (let key in tmr) {
                        if(key !== 'interval') temp_tmr[key] = tmr[key];
                    }
                    temp.push(temp_tmr);
                }

                res.json({ Timers: this.Timers, ActiveTimers: temp });
            })
            .post((req, res, next) => {
                let s = this.addTimer(req.body.timer, (res.locals.user || {}).preferred_username);
                if (s === true) res.sendStatus(200);
                else res.json({ err: s });
            })
            .put((req, res, next) => {
                let s = this.editTimer(req.body.timer, (res.locals.user || {}).preferred_username);
                if (s === true) res.sendStatus(200);
                else res.json({ err: s });
            })
            .lock((req, res, next) => {
                let s = this.stopTimer(req.body.name);
                if (s === true) res.sendStatus(200);
                else res.json({ err: s });
            })
            .unlock((req, res, next) => {
                let s = this.startTimer(req.body.name);
                if (s === true) res.sendStatus(200);
                else res.json({ err: s });
            })
            .move((req, res, next) => {
                let s = this.renameTimer(req.body.oldname, req.body.newname, (res.locals.user || {}).preferred_username);
                if (s === true) res.json({ data: "Timer: " + req.body.name + " RENAMED!" });
                else res.json({ err: s });
            })
            .delete ((req, res, next) => {
                let s = this.removeTimer(req.body.name, (res.locals.user || {}).preferred_username);
                if (s === true) res.sendStatus(200);
                else res.json({ err: s });
            });

        AuthAPIRouter.delete('/oncooldown', (req, res, next) => {
            this.removeCooldown(req.body.name);
            res.json({ onCooldown: this.onCooldown });
        });
        this.setAuthenticatedAPIRouter(AuthAPIRouter, { user_level: 'moderator' });

        //PackageInterconnect
        this.allowPackageInterconnects('all');

        this.SETUP_COMPLETE = true;
        return this.reload();
    }
    async reload() {
        if (!this.isEnabled()) return Promise.reject(new Error("Package is disabled!"));

        this.loadCommands();
        this.loadVariables();
        this.loadTimers();

        this.Logger.info("CommandHandler (Re)Loaded!");
        return Promise.resolve();
    }

    async disable() {
        if (!this.isEnabled()) return Promise.resolve();

        this.setEnable(false);
        if (this.isEnabled() !== false) return Promise.reject(new Error('disable failed'));

        for (let tmr of this.ActiveTimers) {
            this.stopTimer(tmr.name, false);
        }

        this.Logger.warn("Package disabled!");
        return Promise.resolve();
    }

    EventSub_Online(body) {
        if (this.WatchTime_Interval === null) {
            this.WatchTime_Interval = setInterval(() => {
                this.AwardWatchTime().catch(err => this.Logger.error(err.message));
            }, 1000 * 60);
        }

        //Enable/Disable Timers
        for (let tmr of this.Timers) {
            if (tmr.auto_enable === 'offline') this.stopTimer(tmr.name);
            if (tmr.auto_enable === 'online') this.startTimer(tmr.name);
        }
    }
    EventSub_Offline(body) {
        if (this.WatchTime_Interval) {
            clearInterval(this.WatchTime_Interval);
            this.AwardWatchTime().catch(err => this.Logger.error(err.message));
        }

        //Enable/Disable Timers
        for (let tmr of this.Timers) {
            if (tmr.auto_enable === 'online') this.stopTimer(tmr.name);
            if (tmr.auto_enable === 'offline') this.startTimer(tmr.name);
        }
    }
    EventSub_Update(body) {
        //Enable/Disable Timers
        for (let tmr of this.Timers) {
            if (tmr.auto_enable === 'game' && body.event.category_name === tmr.game) this.startTimer(tmr.name);
            if (tmr.auto_enable === 'game' && body.event.category_name !== tmr.game) this.stopTimer(tmr.name);
        }
    }
    async Stream_Status_Poll() {
        try {
            let stream = await this.TwitchAPI.GetStreams({ user_login: this.TwitchIRC.getChannel() }).data[0];

            if (stream) {
                EventSub_Online();
                EventSub_Update({
                    event: {
                        category_name: stream.game_name
                    }
                });
            }
            else EventSub_Offline();
        } catch (err) {
            console.log(err);
        }
    }

    async Controllable_PollStream() {
        if (!this.isEnabled()) return Promise.reject(new Error('Twitch IRC is disabled'));

        try {
            await this.Stream_Status_Poll();
            return Promise.resolve("Stream Data Polled and Commands / Timers updated!");
        } catch (err) {
            return Promise.reject(err);
        }
    }
    async AwardWatchTime() {
        let viewers = [];

        try {
            let json = await this.TwitchAPI.GetChannelViewers(this.TwitchIRC.getChannel());
            
            for (let key in json.chatters) {
                for (let viewer of json.chatters[key]) {
                    viewers.push(viewer);
                }
            }
        } catch (err) {
            this.Logger.warn('Watchtime viewerlist not available!');
            return Promise.reject(err);
        }

        //Fetch Users
        let db_users = [];

        try {
            db_users = await this.WatchTimeDB.find({ });
        } catch (err) {
            this.Logger.warn('DB viewerlist not available!');
            return Promise.reject(err);
        }
        
        for (let viewer of viewers) {
            let user = db_users.findOne({ user_login: viewer });
            if (user) user.count++;
            else db_users.push({ user_login: viewer, count: 1 });
        }
        
        //Update DB
        try {
            await this.WatchTimeDB.replace(db_users);
        } catch (err) {
            this.Logger.warn('DB viewerlist wasnt updated!');
            return Promise.reject(err);
        }
    }

    //////////////////////////////////////////////
    //      COMMAND CHECKING AND EXECUTION
    //////////////////////////////////////////////

    async CommandHandler(messageObj) {
        return new Promise(async (resolve, reject) => {
            let start_time = Date.now();
            
            let detectedCmds = this.checkMessage(messageObj.getMessage());
            let lastEnd = 0;
            let successfullCommands = [];
            
            //Check All Commands
            for (let i = 0; i < detectedCmds.length; i++) {
                let checkedMsgObj = detectedCmds[i];

                let commandObj = checkedMsgObj.command;
                let parameters = messageObj.message;
                let success = false;
                
                //get limited Parameters
                if (i < detectedCmds.length - 1 && checkedMsgObj.type != "HARDCODED") {
                    let next = parameters.indexOf(detectedCmds[i + 1].command.name, lastEnd);
                    parameters = parameters.substring(lastEnd, next - 1);
                    lastEnd = next;
                } else {
                    parameters = parameters.substring(lastEnd);
                }

                parameters = parameters.split(" ");
                
                //Detection Type CHECK - Block NOW
                if (commandObj.detection_type == "beginning_only_detection" || commandObj.detection_type == "multi_detection") {     //beginning_only_detection OR multi_detection -> cur command Name at index = 0
                    if (checkedMsgObj.index != 0) continue;
                }

                //OnCooldown?
                let cooldown = this.isOnCooldown(commandObj.name);

                if (messageObj.matchUserlevel(commandObj.userlevel, 'moderator')) {
                    cooldown = false;
                }
                
                //Execute Command
                if (!cooldown && checkedMsgObj.type == "HARDCODED") {
                    try {
                        await checkedMsgObj.ClassObject.execute(messageObj, parameters);
                        success = true;
                    } catch (err) {
                        console.log(err);
                    }
                } else if (!cooldown && checkedMsgObj.type == "CUSTOM") {
                    if (this.checkCuEnvironment(commandObj, messageObj)) {
                        try {
                            await this.executeCuCommand(commandObj, messageObj, parameters, detectedCmds[i].index);
                            success = true;
                        } catch (err) {
                            console.log(err);
                        }
                    }
                }

                //Add to Cooldown
                if (success) {
                    this.addCooldown(commandObj.name, this.parseCooldownString(commandObj.cooldown));

                    let tempDataColComd = JSON.parse(JSON.stringify(commandObj));
                    tempDataColComd.params = parameters;

                    successfullCommands.push(tempDataColComd);

                    this.STAT_NUB_COMMANDS++;
                    this.STAT_NUB_COMMANDS_PER_10++;
                }

                //Detection Type CHECK - Block NEXT
                if (commandObj.detection_type != "multi_detection" && commandObj.detection_type != "multi_inline_detection") {       //NO multi_detection AND NO multi_inline_detection -> block following Cmds
                    break;
                }
            }


            let end_time = Date.now();

            this.STAT_AVG_TIME = Math.floor((this.STAT_AVG_TIME + end_time - start_time) / this.STAT_NUB_COMMANDS);
            this.STAT_AVG_TIME_PER_10 = Math.floor((this.STAT_AVG_TIME_PER_10 + end_time - start_time) / this.STAT_NUB_COMMANDS_PER_10);
            
            resolve(successfullCommands);
        }).catch(err => {
            console.log(err);
            return Promise.reject(err);
        });
    }

    //Message Checking
    checkMessage(message) {
        let out = [];
        let index = 0;

        for (let word of message.split(" ")) {
            for (let hcCMDName in this.HardcodedCommands) {
                
                let hcCMD = this.HardcodedCommands[hcCMDName];
                if (word !== hcCMDName || !hcCMD.isEnabled()) continue;
                
                let json = hcCMD.toJSON();
                json.name = hcCMDName;
                out.push({
                    type: "HARDCODED",
                    command: json,
                    index: index,
                    ClassObject: hcCMD
                });
            }

            for (let cuCMD of this.CustomCommands) {
                if (cuCMD.enabled === false) continue;
                
                if (cuCMD.regex) {
                    let regex = new RegExp(cuCMD.regex);
                    if (!regex.test(word)) continue;
                } else {
                    if (word !== cuCMD.name && cuCMD.case === true) continue;
                    if (word.toLowerCase() !== cuCMD.name.toLowerCase() && cuCMD.case === false) continue;
                }

                out.push({
                    type: "CUSTOM",
                    command: cuCMD,
                    index: index
                });
            }

            index += word.length + 1;
        }
        
        out.sort((a, b) => {
            return a.index - b.index;
        });
        
        return out;
    }
    
    checkCuEnvironment(commandObj, messageObj) {
        //Check Userlevel Access
        if (!messageObj.matchUserlevel(commandObj.userlevel, commandObj.strictlevel)) {
            return false;
        }

        return true;
    }

    //Execute
    async executeCuCommand(commandObj, messageObj, parameters = [], start) {
        try {
            let out = null;
            
            if (commandObj.alias !== undefined && commandObj.alias !== "") {
                let checked_msg = this.checkMessage(commandObj.alias);
                let new_parameters = commandObj.alias.split(" ");

                for (let i = 0; i < checked_msg.length && i < 1; i++) {
                    if (checked_msg[i].type === 'HARDCODED') {
                        await checked_msg[i].ClassObject.execute(messageObj, new_parameters);
                    } else {
                        return this.executeCuCommand(checked_msg[i].command, messageObj, new_parameters, start);
                    }
                }
            } else {
                out = await this.fillCommandVariables(commandObj, messageObj, parameters, start);
            }

            if (typeof out == "string") {
                if (out.trim() === "") return Promise.resolve();

                console.log(out);

                let command = out.split(' ')[0];

                for (let cmd in TWITCHIRC.IRC_COMMANDS) {
                    if (command !== cmd) continue;
                    return this.TwitchIRC[cmd.substring(1)](out.substring(cmd.indexOf(' ')));
                    break;
                }

                return this.TwitchIRC.say(out);
            } else {
                return Promise.reject(new Error("No Command Execution"));
            }
        } catch (err) {
            return Promise.reject(err);
        }
    }
    
    //Command Variables
    async fillCommandVariables(commandObj, messageObj, parameters, start) {
        if (commandObj) {
            if (commandObj.output) {
                let temp = false;
                let first = 0;
                let output = temp;

                do {
                    output = temp;
                    try {
                        temp = await this.replaceVariables((temp !== false ? temp : commandObj.output), messageObj, commandObj, parameters, start);
                    } catch (err) {
                        return Promise.reject(err);
                    }
                    first++;
                } while (temp !== false);
                
                return Promise.resolve((output === false && first <= 1) ? commandObj.output : output);
            }
        }
        return Promise.reject("Command Structure Error");
    }
    async replaceVariables(filledString, messageObj, origCommand, parameters, start) {
        if (filledString.indexOf("$(") >= 0) {
            if (filledString.indexOf(")", filledString.indexOf("$(")) >= 0) {
                
                let variables = this.extractVariables(filledString);

                if (variables == false) {       //Command Output Grammar ERROR
                    return Promise.reject(new Error("Grammar Error"));
                }

                for (let vari of variables) {
                    try {
                        let replaced = await this.replaceVariables(vari.substring(2, vari.length - 1), messageObj, origCommand, parameters, start);

                        if (replaced == false) {
                            //REPLACE CONTENT
                            
                            let vari_Name = vari.substring(2, vari.length - 1).toLowerCase().split(" ")[0];
                            let content = "";
                            
                            if (this.CommandVariables[vari_Name] && this.CommandVariables[vari_Name].isEnabled()) {
                                try {
                                    content = await this.CommandVariables[vari_Name].getValue(vari, messageObj, origCommand, parameters, start);
                                } catch (err) {
                                    return Promise.reject(err);
                                }
                            } else {
                                //Try "Arguments"
                                try {
                                    content = await this.CommandVariables["Arguments"].getValue(vari, messageObj, origCommand, parameters, start);
                                } catch (err) {
                                    if (err.message !== 'Wrong Format!') return Promise.reject(err);

                                    //Try Custom Variable
                                    try {
                                        content = await this.CommandVariables["Custom"].getValue(vari, messageObj, origCommand, parameters, start);
                                    } catch (err) {
                                        return Promise.reject(err);
                                    }
                                }
                            }
                            
                            filledString = filledString.substring(0, filledString.indexOf(vari)) + (content ? content : "") + filledString.substring(filledString.indexOf(vari) + vari.length);
                        } else {
                            filledString = filledString.substring(0, filledString.indexOf(vari) + 2) + replaced + filledString.substring(filledString.indexOf(vari) + vari.length - 1);
                        }
                    } catch (err) {
                        return Promise.reject(err);
                    }
                }

                return Promise.resolve(filledString);
            } else {
                return Promise.resolve(false);
            }
        } else {
            return Promise.resolve(false);
        }
    }
    extractVariables(commandOutString) {
        let variables = [];
        if (commandOutString.indexOf("$(") >= 0) {
            if (commandOutString.indexOf(")", commandOutString.indexOf("$(")) >= 0) {
                let start = 0;
                let open;
                let close;

                while (start >= 0 && start < commandOutString.length) {
                    if (commandOutString.indexOf("$(", start) < 0) break;
                    start = commandOutString.indexOf("$(", start) + 2;

                    open = 1;
                    close = 0;

                    let tempStart = start;

                    while (open != close) {
                        if (commandOutString.indexOf("(", tempStart) >= 0 && commandOutString.indexOf("(", tempStart) < commandOutString.indexOf(")", tempStart)) {
                            open++;
                            tempStart = commandOutString.indexOf("(", tempStart) + 1;
                        } else if (commandOutString.indexOf(")", tempStart) >= 0) {
                            close++;
                            tempStart = commandOutString.indexOf(")", tempStart) + 1;
                        } else {
                            return [];
                        }
                    }

                    variables.push(commandOutString.substring(start - 2, tempStart))
                    start = tempStart;
                }
            }
        }
        return variables;
    }

    addCooldown(name, relative_endtime = 0) {
        if (relative_endtime === null) relative_endtime = 60 * 1000;

        let idx = -1;
        this.onCooldown.find((elt, index) => {
            if (elt.name === name) {
                idx = index;
                return true;
            }
            return false;
        });
        if (idx < 0) this.onCooldown.push({ name, time: Date.now() + relative_endtime });
        else this.onCooldown[idx].time = Date.now() + relative_endtime;
    }
    removeCooldown(name) {
        let idx = -1;
        this.onCooldown.find((elt, index) => {
            if (elt.name === name) {
                idx = index;
                return true;
            }
            return false;
        });
        if (idx < 0) return;

        this.onCooldown.splice(idx, 1);
    }
    isOnCooldown(name) {
        let cd = this.onCooldown.find(elt => elt.name === name);
        if (!cd || cd.time < Date.now()) {
            this.removeCooldown(name);
            return false;
        }
        return true;
    }

    //Timers
    startTimer(name, init_offset = 0, dir = -1) {
        let timer = this.Timers.find(elt => elt.name === name);
        if (!timer) return "Timer not found.";
        if (this.ActiveTimers.find(elt => elt.name === name)) return "Timer already active.";
        
        //Timer Interval Management
        let time = this.parseCooldownString(timer.interval) + Math.abs(init_offset) * dir;
        let boosted_time = time < 1000 ? 1000 : time;
        
        this.ActiveTimers.push({
            name, started_at: Date.now() + boosted_time, time: boosted_time, lines: 0,
            interval: setInterval(() => this.GENERAL_TIMER_INTERVAL(name + ""), boosted_time)
        });
        
        //Logging
        timer.enabled = true;
        this.saveTimers();

        this.Logger.info("Timer " + name + " started!");

        return true;
    }
    stopTimer(name, set_enable = true) {
        let idx = -1;
        this.ActiveTimers.find((elt, index) => {
            if (elt.name === name) {
                idx = index;
                return true;
            }
            return false;
        });
        if (idx < 0) return "Timer not active.";
        this.Logger.info("Timer " + name + " stopped!");

        clearInterval(this.ActiveTimers[idx].interval);

        let timer = this.Timers.find(elt => elt.name === name);
        if (timer && set_enable) {
            timer.enabled = false;
            this.saveTimers();
        }

        this.ActiveTimers.splice(idx, 1);

        return true;
    }
    resetTimer(name) {
        let timer = this.Timers.find(elt => elt.name === name);
        let act_timer = this.ActiveTimers.find(elt => elt.name === name);
        if (!timer) return "Timer not found.";
        if (!act_timer) return "Timer not active.";
        
        //Reset Interval Information
        act_timer.started_at = Date.now() + this.parseCooldownString(timer.interval);
        clearInterval(act_timer.interval);
        act_timer.lines = 0;
        act_timer.time = this.parseCooldownString(timer.interval);
        act_timer.interval = setInterval(() => this.GENERAL_TIMER_INTERVAL(name), this.parseCooldownString(timer.interval));
        return true;
    }

    async GENERAL_TIMER_INTERVAL(name) {
        
        //Debug Check (hopefully never seen)
        let timer_obj = this.ActiveTimers.find(elt => elt.name === name);
        let timer = this.Timers.find(elt => elt.name === name);

        if (!timer_obj) {
            this.Logger.error("TIMER MEMORY LEAK!! Interval still active, without active Timer! (" + name + ")");
            return Promise.resolve();
        }
        if (!timer) {
            this.Logger.warn("Timer got deleted! Removing Interval!");
            this.stopTimer(name);
            return Promise.resolve();
        }

        let messageObj = new TWITCHIRC.Message(this.TwitchIRC.getChannel(), this.TwitchIRC.getUsername(), timer.alias || timer.output, { badges: { moderator: '1' } });

        //Remanage Interval when offset was used
        if (timer_obj.time !== this.parseCooldownString(timer.interval)) {
            clearInterval(timer_obj.interval);
            timer_obj.time = this.parseCooldownString(timer.interval);
            timer_obj.interval = setInterval(() => this.GENERAL_TIMER_INTERVAL(name), this.parseCooldownString(timer.interval));
        }

        //Reset Interval Information
        timer_obj.started_at = Date.now() + this.parseCooldownString(timer.interval);

        //Only Execute when min. Messages between Timers
        if (timer_obj.lines < timer.lines) return Promise.resolve();
        timer_obj.lines = 0;

        //Execute Command
        try {
            let out = null;

            if (timer.alias !== undefined && timer.alias !== "") {
                //Use Alias
                let checked_msg = this.checkMessage(timer.alias);
                let new_parameters = timer.alias.split(" ");

                if (checked_msg[0].type === 'HARDCODED') {
                    await checked_msg[0].ClassObject.execute(messageObj, new_parameters, this.onCooldown);
                } else {
                    await this.executeCuCommand(checked_msg[0].command, messageObj, new_parameters, 0);
                    return Promise.resolve();
                }
            } else {
                //Use Output
                out = await this.fillCommandVariables(timer, messageObj, timer.output.split(" "), 0);
            }

            if (typeof out == "string" && out.trim() !== "") await this.TwitchIRC.say(out);
        } catch (err) {
            this.Logger.error(err.message);
        }

        return Promise.resolve();
    }

    //////////////////////////////////////////////
    //      DATABASE STORAGE / MANIPULATION
    //////////////////////////////////////////////

    addHardcodedCommands(name, hc_command) {
        if (hc_command instanceof HCCommand) this.HardcodedCommands[name] = hc_command;
    }
    removeHardcodedCommands(name) {
        delete this.HardcodedCommands[name];
    }
    renameHardCoded(orig_name = "", new_name = "", user = "UNKNOWN") {
        if (!orig_name || !this.validateName(new_name)) return "Invalid Command name"; 

        if (this.HardcodedCommands[new_name]) return "Command already exists";
        if (this.CustomCommands.find(elt => elt.name === new_name)) return "Command already exists";

        let name_list = Object.getOwnPropertyNames(this.HardcodedCommands);
        let i = 0;

        for (let cmd of name_list) {
            //Found Command
            if (this.HardcodedCommands[cmd].getName() === orig_name) {
                //replace name order
                name_list.splice(i, 1, new_name);

                //Create New Object List
                let temp = {};
                for (let name of name_list) {
                    temp[name] = this.HardcodedCommands[name] || this.HardcodedCommands[cmd];
                }
                this.HardcodedCommands = temp;
                
                return true;
            }

            i++;
        }

        return "Command not found";
    }

    loadCommands() {
        let cfg = this.Config.GetConfig();

        try {
            let s = super.readFile(cfg['data_dir'] + "Commands.json");

            //read File and convert to JSON (errors if errored before)
            let json = JSON.parse(s);

            //Custom Commands
            for (let cmd of json.Commands || []) {
                let s = this.validate(cmd);
                if (s === true) this.CustomCommands.push(cmd);
                else this.Logger.error("Command " + cmd.name + " Error: " + s);
            }
        } catch (err) {
            if (err.message === '404: File doesnt Exist!') this.saveCommands();
            else this.Logger.error(err.message);
        }
    }
    saveCommands() {
        let cfg = this.Config.GetConfig();

        try {
            this.writeFile(cfg['data_dir'] + "Commands.json", JSON.stringify({ Commands: this.CustomCommands }, null, 4));
            return true;
        } catch (err) {
            this.Logger.error(err.message);
        }
        return false;
    }

    addCommand(command, user = "UNKNOWN") {
        if (!command) return "No Data supplied!";
        if (this.CustomCommands.find(elt => elt.case === true ? (command.name === elt.name) : (command.name.toLowerCase() === elt.name.toLowerCase())))
            return "Command already exists!";

        command.added_by = user;

        let s = this.validate(command);
        if (typeof (s) == "string") return s;
        
        this.CustomCommands.push(command);
        this.Logger.info("Command: " + command.name + " ADDED by " + user + "!");
        return this.saveCommands();
    }
    editCommand(command, user = "UNKNOWN") {
        if (!command) return "No Data supplied!";
        let cmd_idx = -1;
        this.CustomCommands.find((elt, idx) => {
            if (elt.case === true ? (command.name === elt.name) : (command.name.toLowerCase() === elt.name.toLowerCase())) {
                cmd_idx = idx;
                return true;
            }
            return false;
        });
        if (cmd_idx < 0) return "Command doesnt exists!";

        command.added_by = user;

        let s = this.validate(command);
        if (typeof (s) == "string") return s;

        for (let key in this.CustomCommands[cmd_idx]) {
            if (command[key] === undefined) command[key] = this.CustomCommands[cmd_idx][key];
        }

        this.CustomCommands.splice(cmd_idx, 1, command);
        this.Logger.info("Command: " + command.name + " UPDATED by " + user + "!");
        return this.saveCommands();
    }
    renameCommand(oldName, newName, user = "UNKNOWN") {
        if (!oldName) return "oldName not supplied!";
        if (!newName) return "newName not supplied!";

        let old_cmd_idx = -1;
        let new_cmd_idx = -1;
        this.CustomCommands.find((elt, idx) => {
            if (elt.case === true ? (oldName === elt.name) : (oldName.toLowerCase() === elt.name.toLowerCase())) {
                old_cmd_idx = idx;
            }
            if (elt.case === true ? (newName === elt.name) : (newName.toLowerCase() === elt.name.toLowerCase())) {
                new_cmd_idx = idx;
            }
            return false;
        });
        if (old_cmd_idx < 0) return "Command doesnt exists!";
        if (new_cmd_idx > -1) return "Command already exists!";

        let s = this.validateName(newName);
        if (s !== true) return s;

        this.CustomCommands[old_cmd_idx].name = newName;
        this.CustomCommands[old_cmd_idx].added_by = user;
        
        this.Logger.info("Command: " + oldName + " RENAMED to " + newName + " by " + user + "!");
        return this.saveCommands();
    }
    removeCommand(name, user = "UNKNOWN") {
        let cmd_idx = -1;
        this.CustomCommands.find((elt, idx) => {
            if (elt.case === true ? (name === elt.name) : (name.toLowerCase() === elt.name.toLowerCase())) {
                cmd_idx = idx;
                return true;
            }
            return false;
        });
        if (cmd_idx < 0) return "Command doesnt exists!";
        
        this.CustomCommands.splice(cmd_idx, 1);
        this.Logger.info("Command: " + name + " DELETED by " + user + "!");
        return this.saveCommands();
    }
    
    validate(customCommand) {
        let s = this.validateName(customCommand.name);
        if (typeof (s) == "string") return s;

        for (let template in COMMAND_TEMPLATE_REQUIRED) {
            if (customCommand[template] == null && template === 'output' && (customCommand.alias === undefined || customCommand.alias ===  "")) {
                return "Missing " + template + "!";
            } else if (template !== 'output' && typeof (customCommand[template]) != COMMAND_TEMPLATE[template]) {
                return template + " is not a " + COMMAND_TEMPLATE[template] + "!";
            }
        }

        for (let key in customCommand) {
            if (COMMAND_TEMPLATE[key] == undefined) {
                return key + " is not a valid Attribute!";
            } else if (typeof (customCommand[key]) != COMMAND_TEMPLATE[key]) {
                return key + " is not a " + COMMAND_TEMPLATE[key] + "!";
            } else if (COMMAND_TEMPLATE[key] == "string" && customCommand[key].trim() == "" && key != "description") {
                return key + " is empty!";
            } else if (key === "regex" && (customCommand[key].charAt(0) === '/' || customCommand[key].charAt(customCommand[key].length - 1) === '/')) {
                return "regex has leading slashes!";
            }
        }

        return true;
    }

    loadVariables() {
        let cfg = this.Config.GetConfig();
        try {
            let s = super.readFile(cfg['data_dir'] + "Variables.json");

            //read File and convert to JSON (errors if errored before)
            let json = JSON.parse(s);

            this.CustomVariables = json;
        } catch (err) {
            if (err.message === '404: File doesnt Exist!') this.saveVariables();
            else this.Logger.error(err.message);
        }
    }
    saveVariables() {
        let cfg = this.Config.GetConfig();
        
        try {
            this.writeFile(cfg['data_dir'] + "Variables.json", JSON.stringify(this.CustomVariables, null, 4));
            return true;
        } catch (err) {
            this.Logger.error(err.message);
        }
        return false;
    }
    
    editCustomVariable(path, data, user = "UNKNOWN") {
        this.createObjectPath(this.CustomVariables, path);
        let result = this.setObjectAtPath(this.CustomVariables, path, data);
        if (result !== true) return 'Path not traceable.';
        return this.saveVariables();
    }
    removeCustomVariable(path, user = "UNKNOWN") {
        let result = this.deleteObjectAtPath(this.CustomVariables, path);
        if (result !== true) return 'Path not traceable.';
        return this.saveVariables();
    }

    loadTimers() {
        let cfg = this.Config.GetConfig();
        let json = "";

        try {
            let s = super.readFile(cfg['data_dir'] + "Timers.json");
            
            //read File and convert to JSON (errors if errored before)
            json = JSON.parse(s);
        } catch (err) {
            if (err.message === '404: File doesnt Exist!') this.saveTimers();
            else this.Logger.error(err.message);
            return;
        }
        
        //Init Timers
        for (let tmr of json.Timers || []) {
            let s = this.validateTimer(tmr);
            if (s === true) {
                this.Timers.push(tmr);

                //Start Timer
                try {
                    if (tmr.enabled === true) this.startTimer(tmr.name, Math.floor(Math.random() * this.parseCooldownString(tmr.interval)));
                } catch (err) {

                } 

            }
            else this.Logger.error("Timer " + tmr.name + " Error: " + s);
        }
    }
    saveTimers() {
        let cfg = this.Config.GetConfig();

        try {
            this.writeFile(cfg['data_dir'] + "Timers.json", JSON.stringify({ Timers: this.Timers }, null, 4));
            return true;
        } catch (err) {
            this.Logger.error(err.message);
        }
        return false;
    }

    addTimer(timer, user = "UNKNOWN") {
        if (!timer) return "No Data supplied!";

        if (this.Timers.find(elt => timer.name === elt.name))
            return "Timer already exists!";

        timer.added_by = user;

        let s = this.validateTimer(timer);
        if (typeof (s) == "string") return s;

        this.Timers.push(timer);

        if (timer.enabled === true) this.startTimer(timer.name);

        this.Logger.info("Timer: " + timer.name + " ADDED by " + user + "!");
        return this.saveTimers();
    }
    editTimer(timer, user = "UNKNOWN") {
        if (!timer) return "No Data supplied!";

        //Find Timer
        let tmr_idx = -1;
        this.Timers.find((elt, idx) => {
            if (timer.name === elt.name) {
                tmr_idx = idx;
                return true;
            }
            return false;
        });
        if (tmr_idx < 0) return "Timer doesnt exists!";

        //Check new Data
        let s = this.validateTimer(timer);
        if (typeof (s) == "string") return s;

        //Update Timer Data
        timer.added_by = user;
        this.Timers.splice(tmr_idx, 1, timer);

        //Re/Start/Stop Timer given the current Runtime / Enable State
        if (timer.enabled === true) {
            let offset = 0;
            let act_timer = this.ActiveTimers.find(elt => elt.name === timer.name);
            if (act_timer) {
                let temp = act_timer.started_at - Date.now();
                offset = act_timer.time - temp;
            }

            this.startTimer(timer.name, offset);
        } else {
            this.stopTimer(timer.name);
        }

        this.Logger.info("Timer: " + timer.name + " UPDATED by " + user + "!");
        return this.saveTimers();
    }
    removeTimer(name, user = "UNKNOWN") {
        let tmr_idx = -1;
        this.Timers.find((elt, idx) => {
            if (name === elt.name) {
                tmr_idx = idx;
                return true;
            }
            return false;
        });
        if (tmr_idx < 0) return "Timer doesnt exists!";

        let s = this.stopTimer(name);
        if (typeof (s) == "string" && s !== 'Timer not active.') return s;

        this.Timers.splice(tmr_idx, 1);
        this.Logger.info("Timer: " + name + " DELETED by " + user + "!");
        return this.saveTimers();
    }
    renameTimer(oldName, newName, user = "UNKNOWN") {
        if (!oldName) return "oldName not supplied!";
        if (!newName) return "newName not supplied!";

        let old_tmr_idx = -1;
        let new_tmr_idx = -1;
        this.Timers.find((elt, idx) => {
            if (elt.case === true ? (oldName === elt.name) : (oldName.toLowerCase() === elt.name.toLowerCase())) {
                old_tmr_idx = idx;
            }
            if (elt.case === true ? (newName === elt.name) : (newName.toLowerCase() === elt.name.toLowerCase())) {
                new_tmr_idx = idx;
            }
            return false;
        });
        if (old_tmr_idx < 0) return "Timer doesnt exists!";
        if (new_tmr_idx > -1) return "Timer already exists!";

        let s = this.validateName(newName);
        if (s !== true) return s;
        
        this.Timers[old_tmr_idx].name = newName;
        this.Timers[old_tmr_idx].added_by = user;

        //ReStart Timer given the current Runtime / Enable State
        if (this.Timers[old_tmr_idx].enabled === true) {
            let offset = 0;
            let act_timer = this.ActiveTimers.find(elt => elt.name === oldName);
            if (act_timer) {
                let temp = act_timer.started_at - Date.now();
                offset = act_timer.time - temp;
            }
            
            this.startTimer(newName, offset);
        }

        this.stopTimer(oldName);
        
        this.Logger.info("Timer: " + oldName + " RENAMED to " + newName + " by " + user + "!");
        return this.saveTimers();
    }

    validateTimer(timer) {
        let s = this.validateName(timer.name);
        if (typeof (s) == "string") return s;

        for (let template in TIMER_TEMPLATE_REQUIRED) {
            if (timer[template] == null && template === 'output' && (timer.alias === undefined || timer.alias === "")) {
                return "Missing " + template + "!";
            } else if (template !== 'output' && typeof (timer[template]) != TIMER_TEMPLATE[template]) {
                return template + " is not a " + TIMER_TEMPLATE[template] + "!";
            }
        }

        for (let key in timer) {
            if (TIMER_TEMPLATE[key] == undefined) {
                return key + " is not a valid Attribute!";
            } else if (typeof (timer[key]) != TIMER_TEMPLATE[key]) {
                return key + " is not a " + TIMER_TEMPLATE[key] + "!";
            } else if (TIMER_TEMPLATE[key] == "string" && timer[key].trim() == "" && key != "description") {
                return key + " is empty!";
            }
        }

        return true;
    }
    
    validateName(name) {
        if (!name) {
            return "No Name found!";
        } else if (typeof name !== "string") {
            return "Name is not a string!";
        } else if (name.indexOf(" ") >= 0) {
            return "Unsupported Characters found!";
        }

        return true;
    }

    //////////////////////////////////////////////
    //                  UTIL
    //////////////////////////////////////////////
    getFormatedStringVariables(string) {
        let vars = [];
        let start = 0;

        while (string.indexOf("{{", start) >= 0 && string.indexOf("}}", start) >= 0) {
            vars.push({
                pos: string.indexOf("{{", start),
                end: string.indexOf("}}", start),
                name: string.substring(string.indexOf("{{", start) + 2, string.indexOf("}}", start))
            });

            start = string.indexOf("}}", start) + 2;
        }

        return vars;
    }
    
    getObjectFromPath(obj, path) {
        try {
            if (!(path instanceof Array)) path = path.split('.');
            if (path.length === 0) return obj;
            if (obj[path[0]] === undefined) return null;
            if (obj[path[0]] !== undefined) return this.getObjectFromPath(obj[path[0]], path.slice(1));
            else return obj;
        } catch (err) {
            return null;
        }
    }
    setObjectAtPath(obj, path, value) {
        try {
            let splitted_path = path.split('.').slice(0, path.split('.').length - 1);
            obj = this.getObjectFromPath(obj, splitted_path);
            obj[path.split('.')[path.split('.').length - 1]] = value;
            return true;
        } catch (err) {
            return false;
        }
    }
    deleteObjectAtPath(obj, path) {
        try {
            let splitted_path = path.split('.').slice(0, path.split('.').length - 1);
            obj = this.getObjectFromPath(obj, splitted_path);
            delete obj[path.split('.')[path.split('.').length - 1]];
            return true;
        } catch (err) {
            return false;
        }
    }
    createObjectPath(obj, path) {
        let splitted = path.split('.');

        for (let i = 0; i < splitted.length; i++) {
            let split = splitted[i];
            if (obj[split] === undefined) obj[split] = {};
            obj = obj[split];
        }
    }

    getRelativeTimeString(timeMS = 0, cut_at_day = false) {
        let rel = Date.now() - timeMS;
        let y = 0, d = 0, h = 0, m = 0, s = 0;
        rel = Math.floor(rel / 1000);

        y = Math.floor(rel / (365 * 24 * 60 * 60)); //Years
        rel -= y * 365 * 24 * 60 * 60;
        d = Math.floor(rel / (24 * 60 * 60));       //Days
        rel -= d * 24 * 60 * 60;
        h = Math.floor(rel / (60 * 60));            //Hours
        rel -= h * 60 * 60;
        m = Math.floor(rel / (60));                 //Minute
        rel -= m * 60;
        s = rel;                                    //Seconds

        let output = "";

        //YEAR
        if (y == 1) output += y + " year ";
        else if (y > 1) output += y + " years ";

        //DAY
        if (d == 1) output += d + " day ";
        else if (d > 1) output += d + " days ";

        if (cut_at_day) return output;

        //HOUR
        if (h == 1) output += h + " hour ";
        else if (h > 1) output += h + " hours ";

        //MINUTE
        if (m == 1) output += m + " minute "
        else if (m > 1) output += m + " minutes ";

        //SECOND
        if (s == 1) output += s + " second";
        else if (m > 1) output += s + " seconds";

        return output;
    }
    parseCooldownString(cooldownString) {
        let numb = 0;
        let out = 0;

        for (let letter of cooldownString) {

            let fact = 1;

            switch (letter) {
                case "h":
                    fact *= 60;
                case "m":
                    fact *= 60;
                case "s":
                    out += numb * fact * 1000;
                    numb = 0;
                    break;
                default:
                    try {
                        numb = (numb * 10) + parseInt(letter);
                    }
                    catch {
                        return -1;
                    }
            }
        }

        return out;
    }
}

class HCCommand {
    constructor(name = "", callback = async (messageObj, parameters) => true, options = {}) {
        this.name = name;

        this.description = options["description"] ? options["description"] : "";
        this.cooldown = options["cooldown"] ? options["cooldown"] : "1s";
        this.userlevels = options["userlevels"] ? options["userlevels"] : ["Regular"];
        this.api_requierements = options["api_requierements"] ? options["api_requierements"] : [];
        this.detection_type = options["detection_type"] ? options["detection_type"] : "beginning_only_detection";
        this.enabled = options["enabled"] != false;
        this.viewing_restriction = options["viewing_restriction"] === true;

        this.callback = callback;
    }

    async execute(userMessageObj, parameters) {
        if (!this.checkEnvironment(userMessageObj)) {
            return Promise.reject(new Error("No Matching Userlevel or on Cooldown!"));
        }

        if (this.callback) {
            return this.callback(userMessageObj, parameters);
        } else {
            return Promise.reject(new Error(this.name + " Not Implemented!"));
        }
    }

    checkEnvironment(messageObj) {
        //Check Userlevel Access
        if (!this.matchUserlevel(messageObj)) {
            return false;
        }

        return true;
    }
    matchUserlevel(messageObj) {
        for (let ul of this.userlevels) {
            if (messageObj.matchUserlevel(ul)) {
                return true;
            }
        }

        return false;
    }

    isViewingRestricted() {
        return this.viewing_restriction === true;
    }
    isEnabled() {
        return this.enabled;
    }
    setEnable(state) {
        this.enabled = state === true;
    }
    getName() {
        return this.name;
    }
    
    toJSON() {
        return {
            orig_name: this.getName(),
            description: this.description,
            api_requierements: this.api_requierements,
            userlevels: this.userlevels,
            detection_type: this.detection_type,
            cooldown: this.cooldown,
            enabled: this.enabled,
            viewing_restriction: this.viewing_restriction
        };
    }
}

class Variable {
    constructor(name, details, callback, enabled = true) {
        this.name = name;
        this.details = details;
        this.enabled = (enabled == true);
        
        if (callback) this.callback = callback;
    }

    async getValue(variableString, userMessageObj, commandOrig, parameters, start) {
        if (!this.isEnabled())
            return Promise.reject(new Error("VARIABLE: " + this.name + " DISABLED!"));
        else if (this.callback == undefined)
            return Promise.reject(new Error("VARIABLE: " + this.name + " not IMPLEMENTED!"));
        else
            return this.callback(variableString, userMessageObj, commandOrig, parameters, start);
    }
    
    getDetails() {
        return {
            details: this.details
        };
    }
    getExtendedDetails() {
        return {
            name: this.getName(),
            details: this.details,
            enabled: this.isEnabled()
        };
    }
    getName() {
        return this.name;
    }
    isEnabled() {
        return (this.enabled == true);
    }
    enable() {
        this.enable = true;
    }
    disable() {
       this.enable = false;
    }
}

module.exports.DETAILS = PACKAGE_DETAILS;
module.exports.CommandHandler = CommandHandler;
module.exports.HCCommand = HCCommand;
module.exports.Variable = Variable;