let BADGES = {

};
let UL_Options = [];
let Basic_UL_Options = [];
let SCOPES = [];

let Commands = [];
let HCCommands = [];
let CommandVariables = [];

let Commands_perPage = 10;
let Commands_currentPage = 0;

let Timers = [];
let Timers_perPage = 10;
let Timers_currentPage = 0;

let CustomVariables = {};

let hightlight_vars = true;
let show_output_only = false;
let fill_output = false;

let AUTH_MODE = false;
let EDIT_MODE = 0;
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
    viewing_restriction: "boolean"
};
const COMMAND_TEMPLATE_REQUIRED = {
    output: "string",
    name: "string"
};
const TRIGGER_MODES = [
    { name: 'beginning_only_detection', title: 'Beginning Only Detection', desc: 'Command will only trigger, when command is called at the start of a message' },
    { name: 'inline_detection', title: 'Inline Detection', desc: 'Command will trigger at any call at point in the message' },
    { name: 'multi_detection', title: 'Multi Detection', desc: 'Multiple Commands can be triggered in the same message. This stops when a command is triggered that doesnt have Multi Detection. Note: This command triggers only when at the beginning of the message.' },
    { name: 'multi_inline_detection', title: 'Multi-Inline Detection', desc: 'Same as Multi Detection, but can be triggered at any point in the message' }
];
const TIMER_AUTO_ENABLE = ['always', 'online', 'offline', 'game'];

const TIMER_TEMPLATE = {
    interval: "string",
    output: "string",
    description: "string",
    enabled: "boolean",
    name: "string",
    lines: "number",
    alias: "string",
    auto_enable: "string",
    game: "string",
    viewing_restriction: "boolean"
};
const TIMER_TEMPLATE_REQUIRED = {
    interval: "string",
    output: "string",
    name: "string"
};

let STUPID_EDITOR_BUG_COUNT = 0;

/*-----------------------------
            SETUP
-----------------------------*/

async function init() {

    OUTPUT_create();
    SWITCHBUTTON_AUTOFILL();
    await updateBadges();

    Basic_UL_Options = UL_Options.filter(x => {
        if (x.title.toLowerCase().indexOf('subscriber') >= 0) return true;
        if (x.title.toLowerCase().indexOf('moderator') >= 0) return true;
        if (x.title.toLowerCase().indexOf('staff') >= 0) return true;
        if (x.title.toLowerCase().indexOf('follower') >= 0) return true;
        if (x.title.toLowerCase().indexOf('regular') >= 0) return true;
        if (x.title.toLowerCase().indexOf('verified') >= 0) return true;
        if (x.title.toLowerCase().indexOf('founder') >= 0) return true;
        if (x.title.toLowerCase().indexOf('broadcaster') >= 0) return true;
        if (x.title.toLowerCase().indexOf('vip') >= 0) return true;
        if (x.title.toLowerCase().indexOf('admin') >= 0) return true;
        return false;
    });
    Basic_UL_Options.sort((a, b) => (-1) * (getRealUserlevel(a.value) - getRealUserlevel(b.value)));

    //Authorization
    if (LOGIN_isLoggedIn() && USERLEVEL_INDEX(LOGIN_getCookies()['user']['user_level']) > USERLEVEL_INDEX('moderator')) {
        AUTH_MODE = true;

        //Prepare Editor
        Basic_UL_Options = UL_Options.filter(x => {
            if (x.value.toLowerCase().indexOf('subscriber:0') >= 0) return true;
            if (x.title.toLowerCase().indexOf('moderator') >= 0) return true;
            if (x.title.toLowerCase().indexOf('staff') >= 0) return true;
            if (x.title.toLowerCase().indexOf('follower') >= 0) return true;
            if (x.title.toLowerCase().indexOf('regular') >= 0) return true;
            if (x.title.toLowerCase().indexOf('verified') >= 0) return true;
            if (x.title.toLowerCase().indexOf('founder') >= 0) return true;
            if (x.title.toLowerCase().indexOf('broadcaster') >= 0) return true;
            if (x.title.toLowerCase().indexOf('vip') >= 0) return true;
            if (x.title.toLowerCase().indexOf('admin') >= 0) return true;
            return false;
        });
        Basic_UL_Options.sort((a, b) => (-1) * (getRealUserlevel(a.value) - getRealUserlevel(b.value)));
        
        document.getElementById('TIMER_LIST_WRAPPER').removeAttribute('hidden');
        document.getElementById('ADD_CUSTOM').removeAttribute('hidden');
        document.getElementById('ADD_TIMER').removeAttribute('hidden');
        document.getElementById('EDITOR_UL').innerHTML = ICON_SELECTION_create(Basic_UL_Options, Basic_UL_Options.find(elt => elt.value == 'Regular'));
        document.getElementById('FILL_SWITCH').removeAttribute('hidden');
        document.getElementById('BOTTOM_SETTINGS').classList.add('three');
    }

    document.getElementById('EDITOR_TIMER_AUTO_ENABLE_WRAPPER').innerHTML = '<span>Auto-Enable</span>' + MISC_SELECT_create(['always', 'online', 'offline', 'game'], 0, "EDITOR_TIMER_AUTO_ENABLE", 'editor_Timer_auto_enable(this)');

    //Fetch Page
    fetch('/api/commands/page', getAuthHeader())
        .then(STANDARD_FETCH_RESPONSE_CHECKER)
        .then(json => {
            SCOPES = json.scopes;
            CustomVariables = json.custom_variables || {};

            //Commands
            if (json.Hardcoded) {
                let i = 0;
                let h = "";

                for (let cmd in json.Hardcoded) {
                    h += createHCContent(cmd, json.Hardcoded[cmd], i++);
                }

                if (h == "") h = '<div><div style="transform: translate(100 %, 0)";>NONE</div></div><div></div>';

                document.getElementById("contentHC").innerHTML = h;
            }
            Commands = json.Custom || [];
            CommandVariables = json.variables;
            Commands.sort(sortByNameDEC);
            updateCommandsTable();

            //Cooldown
            updateCooldownTable(json);

            //Timers
            if (AUTH_MODE) {
                Timers = json.Timers;

                for (let act of json.ActiveTimers) {
                    let tmr = Timers.find(elt => elt.name === act.name);
                    tmr.active = act.started_at;
                    tmr.remaining_lines = tmr.lines - act.lines;
                }

                Timers.sort(sortByNameDEC);
                updateTimerTable();
            }

            hashCheck();
            SWITCHBUTTON_AUTOFILL();
        })
        .catch(err => {
            console.log(err);
            OUTPUT_showError(err.message);
        });
}
async function Fetch_Commands() {
    return fetch("/api/Commands/Commands", getAuthHeader())
        .then(STANDARD_FETCH_RESPONSE_CHECKER)
        .then(json => {
            if (json.Hardcoded) {
                let i = 0;
                let h = "";

                for (let cmd in json.Hardcoded) {
                    h += createHCContent(cmd, json.Hardcoded[cmd], i++);
                }

                if (h == "") h = '<div><div style="transform: translate(100 %, 0)";>NONE</div></div><div></div>';

                document.getElementById("contentHC").innerHTML = h;
            }
            Commands = json.Custom || [];

            Commands.sort(sortByNameDEC);
            updateCommandsTable();
            SWITCHBUTTON_AUTOFILL();
        });
} 
function hashCheck() {
    let hash = GetURLHashArray();

    let json = {};

    if (GetURLHashContent('editor') === 'command') {
        for (let key of hash) {
            if (COMMAND_TEMPLATE[key.name] === undefined) continue;
            json[key.name] = key.value[0];
        }

        if (Object.getOwnPropertyNames(json).length === 0) return;

        editor_Command_set(json);
    } else if (GetURLHashContent('editor') === 'timer') {
        for (let key of hash) {
            if (TIMER_TEMPLATE[key.name] === undefined) continue;
            json[key.name] = key.value[0];
        }

        if (Object.getOwnPropertyNames(json).length === 0) return;

        editor_Command_set(json);
    } else {
        return;
    }
    
    editor_show();
}

/*-----------------------------
          HARDCODED
-----------------------------*/

function toggleShow() {
    if (document.getElementById("content").className == "blur") {
        return;
    }

    if (document.getElementById("contentHC").style.display == "grid") {
        document.getElementById("contentHC").style.display = "none";
        document.getElementById("HCarrow").innerHTML = "▼";
    } else {
        document.getElementById("contentHC").style.display = "grid";
        document.getElementById("HCarrow").innerHTML = "▲";
    }
}
function createHCContent(name, obj, id) {
    let missing = false;

    for (let req of obj.api_requierements) {
        if (!SCOPES.find(elt => elt === req.scope)) missing = true;
    }

    let s = '<div>';
    s += '<input class="HardcodedName" value="' + name + '" placeholder="' + obj.orig_name + '" oninput="showRenameHCcommand(this)" ' + (AUTH_MODE ? '' : 'disabled') + '/>';
    s += '<center style="display: none; margin-top: 10px;">' + (AUTH_MODE ? '<button onclick="renameHCcommand(this)">RENAME</button>' : '') + '</center>';
    s += '</div>';
    
    s += '<div class="HarcodedDetails">' + obj.description + (AUTH_MODE && missing ? '</br><b style="color: red;">Missing API Scope: ' + obj.api_requierements.reduce((sum, cur) => sum += cur.scope + ',' ,'') + '</b>' : '') + '</div>';
    s += '<div>' + (AUTH_MODE ? SWITCHBUTTON_CREATE(obj.enabled, false, "toggleHCEnable('" + name + "', this.value)") : '') + '</div>';
    return s;
}
function toggleHCEnable(name, state) {
    let opts = getAuthHeader();
    opts['method'] = 'PUT';
    opts['headers']['Content-Type'] = 'application/json';
    opts['body'] = JSON.stringify({ name, state });

    fetch('/api/commands/hccommands', opts)
        .then(STANDARD_FETCH_RESPONSE_CHECKER)
        .then(json => {
            OUTPUT_showInfo("Command " + (state ? 'enabled' : 'disabled') + "!");
        })
        .catch(err => {
            console.log(err);
            OUTPUT_showError(err.message);
        });
}
function showRenameHCcommand(elt) {
    if (elt.placeholder === elt.value || !elt.value || !elt.placeholder) {
        elt.parentElement.childNodes[1].style.display = 'none';
    } else {
        elt.parentElement.childNodes[1].style.display = 'block';
    }
}
function renameHCcommand(elt) {
    elt = elt.parentElement.parentElement.childNodes[0];

    let opts = getAuthHeader();
    opts['method'] = 'MOVE';
    opts['headers']['Content-Type'] = 'application/json';
    opts['body'] = JSON.stringify({ orig_name: elt.placeholder, new_name: elt.value });

    fetch('/api/commands/hccommands', opts)
        .then(STANDARD_FETCH_RESPONSE_CHECKER)
        .then(json => {
            OUTPUT_hideError();
            elt.placeholder = elt.value;
            showRenameHCcommand(elt);
        })
        .catch(err => {
            OUTPUT_showError(err.message);
            console.log(err);
        });
}

/*-----------------------------
            CUSTOM
-----------------------------*/

function updateCommandsTable() {
    let options = {
        headers: ['name', 'output', 'userlevel', 'cooldown'],
        header_translation: { 'by': 'added_by' },
        content_translation: {
            output: (x, obj, i, content) => !content.trim() ? (!obj.description || show_output_only ? (hightlight_vars ? createVariableDivs(extractVariables(obj.output || "Alias: " + obj.alias), obj.output || "Alias: " + obj.alias) : (obj.output || "Alias: " + obj.alias)) : obj.description) : '',
            userlevel: (x) => getImgFromBadge(getBadgeObjByName(x))
        },
        column_addition: {
            settings: (x) => '<button yellow onclick="edit_Custom(\'' + x.name + '\')">edit</button><button red onclick="remove_Custom(\'' + x.name + '\')">remove</button>'
        },
        pagination: '',
        ui_change_func: 'Table_UI_change'
    };
    if (AUTH_MODE) options.headers.push('by', 'settings');
    
    let arr = Commands.slice(Commands_perPage * Commands_currentPage, Commands_perPage * (Commands_currentPage + 1));
    document.getElementById('COMMANDS_LIST_CONTENT').innerHTML = MISC_createTable(arr, options);

    updateCommandsUI();
}
function add_Custom() {
    let data = editor_Command_gerneratoreJSON();

    let s = validate(data, COMMAND_TEMPLATE, COMMAND_TEMPLATE_REQUIRED);
    if (typeof (s) == "string") {
        OUTPUT_showError(s, document.getElementById('EDITOR_OUTPUT_1'));
        return Promise.resolve();
    }

    let opts = getAuthHeader();
    opts['method'] = 'POST';
    opts['headers']['Content-Type'] = 'application/json';
    opts['body'] = JSON.stringify({ command: data });
    
    fetch('/api/Commands/Commands', opts)
        .then(STANDARD_FETCH_RESPONSE_CHECKER)
        .then(json => {
            OUTPUT_showInfo("Command added!");
            editor_Command_show(true);

            data.added_by = LOGIN_getUsername();

            //Update Table
            Commands.push(data);
            Commands.sort(sortByNameDEC);
            updateCommandsTable();
        })
        .catch(err => {
            console.log(err);
            OUTPUT_showError(err.message, document.getElementById('EDITOR_OUTPUT_1'));
        });
}
function edit_Custom(name) {
    EDIT_MODE = 1;
    let cmd = Commands.find(elt => elt.name === name);
    editor_Command_set(cmd);
    editor_Command_show();
}
async function send_edit_Custom() {
    let data = editor_Command_gerneratoreJSON();

    //Validate Data
    let s = validate(data, COMMAND_TEMPLATE, COMMAND_TEMPLATE_REQUIRED);
    if (typeof (s) == "string") {
        OUTPUT_showError(s, document.getElementById('EDITOR_OUTPUT_1'));
        return Promise.resolve();
    }
    
    //Change name?
    let oldname = document.getElementById('EDITOR_NAME').placeholder;

    if (oldname !== data.name && Commands.find(elt => elt.name === oldname)) {
        let success = false;
        let opts = getAuthHeader();
        opts['method'] = 'MOVE';
        opts['headers']['Content-Type'] = 'application/json';
        opts['body'] = JSON.stringify({ newname: data.name, oldname });

        await fetch('/api/commands/commands', opts)
            .then(STANDARD_FETCH_RESPONSE_CHECKER)
            .then(json => {
                let idx = -1;
                Commands.find((elt, index) => {
                    if (elt.name === oldname) {
                        idx = index;
                        return true;
                    }

                    return false;
                });
                if (idx >= 0) {
                    Commands[idx].name = data.name;
                    Commands[idx].added_by = LOGIN_getUsername();
                    Commands.sort(sortByNameDEC);
                    updateCommandsTable();
                    success = true;
                } else {
                    OUTPUT_showError("Command not found!", document.getElementById('EDITOR_OUTPUT_1'));
                }
            })
            .catch(err => {
                console.log(err);
                OUTPUT_showError(err.message, document.getElementById('EDITOR_OUTPUT_1'));
            });

        if (!success) return;
    }

    //Update Data
    let opts = getAuthHeader();
    opts['method'] = 'PUT';
    opts['headers']['Content-Type'] = 'application/json';
    opts['body'] = JSON.stringify({ command: data });

    fetch('/api/Commands/Commands', opts)
        .then(STANDARD_FETCH_RESPONSE_CHECKER)
        .then(json => {
            OUTPUT_showInfo("Command changed!");
            editor_Command_show(true);

            data.added_by = LOGIN_getUsername();

            //Update Table
            let idx = -1;
            Commands.find((elt, index) => {
                if (elt.name === data.name) {
                    idx = index;
                    return true;
                }

                return false;
            });
            if (idx >= 0) Commands.splice(idx, 1, data);
            Commands.sort(sortByNameDEC);
            updateCommandsTable();
        })
        .catch(err => {
            console.log(err);
            OUTPUT_showError(err.message, document.getElementById('EDITOR_OUTPUT_1'));
        });
}
async function remove_Custom(name) {
    //Await Confirmation
    let answer = 'NO';

    document.getElementById('CUSTOM_COMMAND_EDITOR').style.display = 'none';
    document.getElementById('TIMER_EDITOR').style.display = 'none';

    try {
        answer = await MISC_USERCONFIRM("YOU SURE YOU WANT THIS?", "Do you really want to delete this Command?");
    } catch (err) {

    }

    document.getElementById('CUSTOM_COMMAND_EDITOR').style.display = null;
    document.getElementById('TIMER_EDITOR').style.display = null;

    if (answer !== 'YES') return Promise.resolve();

    let opts = getAuthHeader();
    opts['method'] = 'DELETE';
    opts['headers']['Content-Type'] = 'application/json';
    opts['body'] = JSON.stringify({ name });

    fetch('/api/Commands/Commands', opts)
        .then(STANDARD_FETCH_RESPONSE_CHECKER)
        .then(json => {
            OUTPUT_showInfo("Command removed!");

            //Update Table
            let idx = -1;
            Commands.find((elt, index) => {
                if (elt.name === name) {
                    idx = index;
                    return true;
                }

                return false;
            });
            if (idx >= 0) Commands.splice(idx, 1);
            Commands.sort(sortByNameDEC);
            updateCommandsTable();
        })
        .catch(err => {
            console.log(err);
            OUTPUT_showError(err.message);
        });
}

//EDITOR
function editor_name_change(elt) {
    elt.value = elt.value.trim();
}
function editor_regex_change(elt) {
    elt.value = elt.value.trim();

    if (elt.value.charAt(0) === '/') elt.value = elt.value.substring(1);
    if (elt.value.charAt(elt.value.length - 1) === '/') elt.value = elt.value.substring(0, elt.value.length - 1);
}

function editor_Command_set(data = {}) {
    let enabled = document.getElementById('EDITOR_ENABLE');
    let name = document.getElementById('EDITOR_NAME');
    let regex = document.getElementById('EDITOR_REGEX');
    let caseSens = document.getElementById('EDITOR_NAME_CASE');
    let detection_type = document.getElementById('EDITOR_Trigger_MODE');
    let output = document.getElementById('EDITOR_OUTPUT');
    let description = document.getElementById('EDITOR_DESC');
    let userlevel = document.getElementById('EDITOR_UL').childNodes[0];
    let strict_level = document.getElementById('EDITOR_UL_MODE');
    let cooldown = document.getElementById('Editor_CD_Text');
    let alias = document.getElementById('EDITOR_ALIAS');
    let viewing_restriction = document.getElementById('EDITOR_VIEWING_RESTRICTION');
    document.getElementById('EDITOR_COUNT_WRAPPER').style.display = 'none';

    if (!data.userlevel) data.userlevel = "Regular";
    editor_Command_badgemode_reverse(data.userlevel);

    name.value = data.name || '';
    regex.value = data.regex || '';
    name.placeholder = name.value;
    caseSens.checked = data.case === true;
    editor_Command_trigger_reverse(data.detection_type || 0);
    output.value = data.output || '';
    description.value = data.description || '';
    alias.value = data.alias || '';
    
    ICON_SELECTOR_setValue(userlevel, UL_Options.find(elt => elt.value === data.userlevel));
    strict_level.value = data.strict_level || 0;
    cooldown.value = data.cooldown || '1m';
    
    if (data.counter !== undefined) {
        document.getElementById('EDITOR_COUNT_WRAPPER').style.display = 'block';
        document.getElementById('EDITOR_COUNT').value = data.counter;
        document.getElementById('EDITOR_COUNT').title = data.counter;
    } else {
        document.getElementById('EDITOR_COUNT_WRAPPER').style.display = 'none';
        document.getElementById('EDITOR_COUNT').value = 0;
        document.getElementById('EDITOR_COUNT').title = 0;
    }

    editor_Command_trigger_mode(detection_type || 0);
    editor_Command_ul_mode(strict_level || 0);
    
    editor_Command_cooldown_reverse(data.cooldown || '1m');

    SWITCHBUTTON_TOGGLE(enabled, data['enabled'] === true);
    SWITCHBUTTON_TOGGLE(viewing_restriction, data['viewing_restriction'] === true);
}

function editor_Command_show(hide = false) {
    if (hide) {
        document.getElementById('MAIN_CONTENT_WRAPPER').classList.remove('blur');
        document.getElementById('CUSTOM_COMMAND_EDITOR').classList.remove('show');
        EDIT_MODE = 0;
        editor_Command_set();
    }
    else {
        document.getElementById('MAIN_CONTENT_WRAPPER').classList.add('blur');
        document.getElementById('CUSTOM_COMMAND_EDITOR').classList.add('show');
    }
}
function editor_Command_cooldown_change(elt) {
    let s = "off";
    let number = parseInt(elt.value);

    if (number < 1) s = "off";
    else if (number < 11) s = number + "s";
    else if (number < 20) s = ((number - 8) * 5) + "s";
    else if (number < 30) s = (number - 19) + "m";
    else s = ((number - 27) * 5) + "m";

    document.getElementById('Editor_CD_Text').value = s;
}
function editor_Command_cooldown_reverse(cooldownStr) {
    let s = 0;
    let number = parseCooldownString(cooldownStr)/1000;

    if (number < 11) s = number;
    else if (number < 60) s = Math.floor(number / 5) + 8;
    else if (number < 600)  s = Math.floor(number / 60) + 19;
    else s = Math.floor(number / 600*5) + 24;

    document.getElementById('EDITOR_CD').value = s;
}
function editor_Command_badgemode(elt) {
    let selected = ICON_SELECTOR_getValue(document.getElementById('EDITOR_UL').childNodes[0]);

    if (elt.checked) document.getElementById('EDITOR_UL').innerHTML = ICON_SELECTION_create(UL_Options);
    else document.getElementById('EDITOR_UL').innerHTML = ICON_SELECTION_create(Basic_UL_Options);

    ICON_SELECTOR_setValue(document.getElementById('EDITOR_UL').childNodes[0], UL_Options.find(ele => ele.value === selected));
}
function editor_Command_badgemode_reverse(badgeString) {
    if (Basic_UL_Options.find(elt => elt.value === badgeString)) {
        document.getElementById('EDITOR_BADGEMODE').checked = false;
        document.getElementById('EDITOR_UL').innerHTML = ICON_SELECTION_create(Basic_UL_Options);
    } else {
        document.getElementById('EDITOR_BADGEMODE').checked = true;
        document.getElementById('EDITOR_UL').innerHTML = ICON_SELECTION_create(UL_Options);
    }

    ICON_SELECTOR_setValue(document.getElementById('EDITOR_UL').childNodes[0], UL_Options.find(elt => elt.value === badgeString));
}
function editor_Command_ul_mode(elt) {
    let modes = [
        { name: '#ModsMasterrace', desc: '"Higher" Badges can use this Command too' },
        { name: 'Badge Mode', desc: 'Badge must be equipped, but the Version doesnt matter (Sub 1 Month or Sub 4 years)' },
        { name: 'Version Mode', desc: 'Badge Version must be equipped, but highter Version count too' },
        { name: 'Exact Mode', desc: 'Exact Badge Version must be equipped' }
    ];
    document.getElementById('Editor_UL_Text').innerHTML = modes[parseInt(elt.value)].name;
    document.getElementById('Editor_UL_Text_Sub').innerHTML = modes[parseInt(elt.value)].desc;
}
function editor_Command_trigger_mode(elt) {
    document.getElementById('Editor_Trigger_Text').innerHTML = TRIGGER_MODES[parseInt(elt.value)].title;
    document.getElementById('Editor_Trigger_Text_Sub').innerHTML = TRIGGER_MODES[parseInt(elt.value)].desc;
}
function editor_Command_trigger_reverse(triggerName) {
    let idx = 0;

    TRIGGER_MODES.find((elt, index) => {
        if (elt.name === triggerName || elt.title === triggerName) {
            idx = index;
            return true;
        }
        return false;
    });

    document.getElementById('EDITOR_Trigger_MODE').value = idx;
}
function editor_Command_output_change(elt, e) {
    if (e.inputType === 'insertLineBreak') elt.value = elt.value.substring(0, elt.value.length - 1);
    if (!hightlight_vars) return;

    else if (extractVariables(elt.value).length > 0) document.getElementById('EDITOR_OUT_VARS').innerHTML = createVariableDivs(extractVariables(elt.value), elt.value);
    else document.getElementById('EDITOR_OUT_VARS').innerHTML = "";

    if (document.getElementById('EDITOR_OUT_VARS').innerHTML == "") document.getElementById('EDITOR_OUT_VARS').style.display = "none";
    else document.getElementById('EDITOR_OUT_VARS').style.display = "inline-block";
}
function editor_Command_counterremove() {
    document.getElementById("EDITOR_COUNT_WRAPPER").style.display = "none";
}
function editor_Command_gerneratoreJSON() {
    let name = document.getElementById('EDITOR_NAME').value;
    let regex = document.getElementById('EDITOR_REGEX').value;
    let case_sens = document.getElementById('EDITOR_NAME_CASE').checked === true;
    let detection_type = TRIGGER_MODES[parseInt(document.getElementById('EDITOR_Trigger_MODE').value)].name;
    let output = document.getElementById('EDITOR_OUTPUT').value;
    let description = document.getElementById('EDITOR_DESC').value;
    let userlevel = ICON_SELECTOR_getValue(document.getElementById('EDITOR_UL').childNodes[0]);
    let strictlevel = parseInt(document.getElementById('EDITOR_UL_MODE').value);
    let cooldown = document.getElementById('Editor_CD_Text').value;
    let enabled = document.getElementById('EDITOR_ENABLE').value === true;
    let alias = document.getElementById('EDITOR_ALIAS').value;
    let counter = parseInt(document.getElementById('EDITOR_COUNT').value);
    let viewing_restriction = document.getElementById('EDITOR_VIEWING_RESTRICTION').value === true;

    let data = { name, detection_type, output, description, userlevel, strictlevel, cooldown, enabled, case: case_sens, alias, viewing_restriction, regex };
    if (document.getElementById('EDITOR_COUNT_WRAPPER').style.display !== 'none' && document.getElementById('EDITOR_COUNT_WRAPPER').style.display !== "") data.counter = counter;

    for (let key in data) {
        if (data[key] === "") delete data[key];
    }

    return data;
}
function editor_Command_gerneratoreHash() {
    let s = "editor=command";
    let cmd = editor_Command_gerneratoreJSON();

    for (let key in cmd) {
        s += "&" + key + "=" + encodeURIComponent(cmd[key]);
    }
    
    return s;
}
function editor_Command_save() {
    if (EDIT_MODE === 0) add_Custom();
    else if (EDIT_MODE === 1) send_edit_Custom();
    else send_rename_Custom();
}

//UI
function Commands_perPageChange(x) {
    if (x.value === 'ALL') Commands_perPage = Commands.length;
    else Commands_perPage = x.value;

    if (Commands_currentPage >= Math.ceil(Commands.length / Commands_perPage)) {
        Commands_lastPage();
        return;
    }

    updateCommandsTable();
}
function Commands_pageChange(x, e) {
    if (e.inputType.startsWith('delete')) return;

    if (x.value < x.min) x.value = x.min;
    else if (x.value > x.max) x.value = x.max;

    Commands_currentPage = x.value - 1;

    updateCommandsTable();
}
function Commands_firstPage() {
    if (Commands_currentPage === 0) return;

    Commands_currentPage = 0;
    updateCommandsTable();
}
function Commands_nextPage() {
    Commands_currentPage++;

    if (Commands_currentPage >= Math.ceil(Commands.length / Commands_perPage)) {
        Commands_lastPage();
        return;
    }

    updateCommandsTable();
}
function Commands_prevPage() {
    Commands_currentPage--;
    if (Commands_currentPage < 0) {
        Commands_firstPage();
        return;
    }

    updateCommandsTable();
}
function Commands_lastPage() {
    if (Commands_currentPage === Math.ceil(Commands.length / Commands_perPage) - 1) return;
    Commands_currentPage = Math.ceil(Commands.length / Commands_perPage) - 1;
    updateCommandsTable();
}

function highlighted_vars(elt) {
    hightlight_vars = elt.value;
    updateCommandsTable();
}
function output_only(elt) {
    show_output_only = elt.value;
    updateCommandsTable();
}
function output_fill(elt) {
    fill_output = elt.value;
    updateCommandsTable();
}

function updateCommandsUI() {
    let elt = document.getElementById('CMD_UI_PAGES');

    let first = elt.childNodes[1];
    let prev = elt.childNodes[3];
    let current = elt.childNodes[5];
    let next = elt.childNodes[7];
    let last = elt.childNodes[9];

    //First + Prev
    if (Commands_currentPage === 0) {
        prev.disabled = true;
        first.disabled = true;
    } else {
        prev.disabled = false;
        first.disabled = false;
    } 

    //Current
    current.value = Commands_currentPage + 1;
    current.max = Math.ceil(Commands.length / Commands_perPage);
    current.title = (Commands_currentPage + 1) + "/" + Math.ceil(Commands.length / Commands_perPage);

    //Last + Next
    if (Commands_currentPage + 1 === Math.ceil(Commands.length / Commands_perPage)) {
        next.disabled = true;
        last.disabled = true;
    } else {
        next.disabled = false;
        last.disabled = false;
    }
}

//Badges
async function updateBadges() {
    BADGES = (await getBadges()).badge_sets;
    let ownBadges = {
        Other: {
            versions: {
                1: {
                    title: "Every Other Badge",
                    description: "Every Other Regular Twitch Badge",
                    image_url_1x: "../images/Badges/Other.png",
                    image_url_2x: "../images/Badges/Other.png",
                    image_url_4x: "../images/Badges/Other.png",
                    last_updated: null,
                    click_action: "none",
                    click_url: ""
                }
            }
        },
        Unknown: {
            versions: {
                1: {
                    title: "Unknown Badge",
                    description: "Idk why, but we could find that Badge!",
                    image_url_1x: "../images/Badges/Unknown.png",
                    image_url_2x: "../images/Badges/Unknown.png",
                    image_url_4x: "../images/Badges/Unknown.png",
                    last_updated: null,
                    click_action: "none",
                    click_url: ""
                }
            }
        },
        Follower: {
            versions: {
                1: {
                    title: "Followers",
                    description: "Followers Badge/Userlevel",
                    image_url_1x: "../images/Badges/Follow.png",
                    image_url_2x: "../images/Badges/Follow.png",
                    image_url_4x: "../images/Badges/Follow.png",
                    last_updated: null,
                    click_action: "none",
                    click_url: ""
                }
            }
        },
        Regular: {
            versions: {
                1: {
                    title: "Regular User",
                    description: "Regular Users Badge",
                    image_url_1x: "../images/Badges/Regular.png",
                    image_url_2x: "../images/Badges/Regular.png",
                    image_url_4x: "../images/Badges/Regular.png",
                    last_updated: null,
                    click_action: "none",
                    click_url: ""
                }
            }
        }
    };

    let subVersions = [3, 6, 9, 12, 24, 36, 48, 60, 72, 84, 96];

    for (let own in ownBadges) {
        BADGES[own] = ownBadges[own];
    }

    for (let badge in BADGES) {
        for (let badgeVersion in BADGES[badge].versions) {

            if (badge == "subscriber") {
                if (badgeVersion == "0") {
                    UL_Options.push({
                        value: "subscriber:0",
                        description: "Subscriber Month: 0 (1)",
                        src: "https://static-cdn.jtvnw.net/badges/v1/5d9f2208-5dd8-11e7-8513-2ff4adfae661/1",
                        title: "Subscriber Month: 0 (1)"
                    });
                } else if (badgeVersion == "1") {
                    for (let version of subVersions) {
                        UL_Options.push({
                            value: "subscriber:" + version,
                            description: "Subscriber Month: " + version,
                            src: "../images/Badges/subscriber_" + version + ".png",
                            title: "Subscriber Month: " + version
                        });
                    }
                }
            } else {
                UL_Options.push(getIconSelectionFriendlyBadge(badge, badgeVersion));
            }
        }
    }
}
async function getBadges() {
    return new Promise(async (resolve, reject) => {
        try {
            let data = await fetch("https://badges.twitch.tv/v1/badges/global/display?language=en")
            let json = await data.json();
            resolve(json);
        } catch (err) {
            reject(err);
        }
    });
}

function getIconSelectionFriendlyBadge(badge, version = Object.getOwnPropertyNames(BADGES[badge].versions)[0]) {
   return {
       value: badge + (Object.getOwnPropertyNames(BADGES[badge].versions).length > 1 ? ":" + version : ""),
       description: BADGES[badge].versions[version].description,
       src: BADGES[badge].versions[version]["image_url_4x"],
       title: getBadgeVersionsString(BADGES[badge].versions[version].title, Object.getOwnPropertyNames(BADGES[badge].versions).length > 1 ? version : null)
    };
}

function getBadgeVersionsString(badgename, version) {
    if (version) {
        return badgename + " (Version: " + version + " )";
    } else {
        return badgename;
    }
}
function getBadgeObjByName(name) {
    let nameLC = name.toLowerCase();
    let nameUC = name;
    let VERSION = null;
    let badgeObj = null;

    let realName = null;

    if (name.lastIndexOf(":") >= 0) {
        VERSION = name.substring(name.lastIndexOf(":") + 1);
        nameLC = nameLC.substring(0, nameLC.lastIndexOf(":"));
        nameUC = nameUC.substring(0, nameUC.lastIndexOf(":"));
    }

    if (BADGES[nameUC]) {
        badgeObj = BADGES[nameUC];
        realName = nameUC;
    } else if (BADGES[nameLC]) {
        badgeObj = BADGES[nameLC];
        realName = nameLC;
    }

    if (badgeObj) {
        if (VERSION) {
            try {
                if (badgeObj.versions[VERSION]) {
                    badgeObj = badgeObj.versions[VERSION];
                } else if (badgeObj.versions[parseInt(VERSION)]) {
                    badgeObj = badgeObj.versions[parseInt(VERSION)];
                }
            } catch{
                return BADGES["Unknown"];
            }
        } else {
            badgeObj = badgeObj.versions[Object.getOwnPropertyNames(badgeObj.versions)[0]];
        }
        badgeObj.name = realName;
        if (VERSION)
            badgeObj.version = VERSION;
        return badgeObj;
    }
    return BADGES["Unknown"];
}
function getImgFromBadge(obj, res) {
    if (!obj || !obj.title || !obj.description || !obj.image_url_1x || !obj.image_url_2x || !obj.image_url_4x || !obj.click_action) {
        return null;
    }

    let temp = '<img src="' + obj['image_url_' + (res ? res : 1) + 'x'] + '" title="' + obj.title + '" />';

    if (obj.click_action == "visit_url") {
        return '<a href="' + obj.click_url + '" target="_blank">' + temp + '</a>'
    } else {
        return temp;
    }
}
function getRealUserlevel(name) {
    let Hierarchy = {
        broadcaster: 7,
        admin: 6,
        staff: 6,
        global_mod: 6,
        moderator: 6,
        vip: 5,
        founder: 4,
        subscriber: 3,
        partner: 2,
        other: 1,
        follower: 1,
        regular: 0
    };

    if (name.lastIndexOf(":") >= 0) {
        name = name.substring(0, name.lastIndexOf(":"));
    }

    //Is in Hirachy
    for (let key in Hierarchy) {
        if (key == name || key.toLowerCase() == name.toLowerCase()) {
            return Hierarchy[key];
        }
    }
    
    if (BADGES[name] || BADGES[name.toLowerCase()]) {
        return Hierarchy["other"];
    }

    return -1;
}

/*-----------------------------
           COOLDOWN
-----------------------------*/

async function fetchCooldown() {
    return fetch("/api/Commands/OnCooldown", getAuthHeader()).then(STANDARD_FETCH_RESPONSE_CHECKER);
}
async function updateCooldownTable(data) {
    if (!data) {
        try {
            data = await this.fetchCooldown();
        } catch (err) {
            OUTPUT_showError(err.message);
        }
    }

    let options = {
        headers: ['name', 'ready'],
        header_translation: { 'ready': 'end' },
        timestamps: { 'ready': 'relative' },
        column_addition: { settings: (x) => '<button red onclick="clear_cooldown(\'' + x.name + '\')">clear</button>' }
    };
    if (AUTH_MODE) options.headers.push('settings');

    //Remove Out Of Date
    let cooldowns = data.onCooldown.filter(elt => {
        let cmd = Commands.find(elt2 => elt2.name === elt.name);
        if (!cmd) return false;
        elt.end = elt.time + parseCooldownString(cmd.cooldown);
        return elt.time + parseCooldownString(cmd.cooldown) - Date.now() > 0;
    });

    //Display
    document.getElementById('COMMANDS_ONCOOLODWN_CONTENT').innerHTML = MISC_createTable(cooldowns, options);
}
function clear_cooldown(name) {
    let opts = getAuthHeader();
    opts['method'] = 'DELETE';
    opts['headers']['Content-Type'] = 'application/json';
    opts['body'] = JSON.stringify({ name });

    fetch('/api/Commands/OnCooldown', opts)
        .then(STANDARD_FETCH_RESPONSE_CHECKER)
        .then(json => {
            OUTPUT_showInfo("Command Cooldown cleared!");

            //Update Table
            updateCooldownTable(json.new_cooldowns);
        })
        .catch(err => {
            console.log(err);
        });
}

/*-----------------------------
           TIMERS
-----------------------------*/

async function fetchTimers() {
    return fetch("/api/commands/timers", getAuthHeader())
        .then(STANDARD_FETCH_RESPONSE_CHECKER)
        .then(json => {
            Timers = json.Timers;

            for (let act of json.ActiveTimers) {
                let tmr = Timers.find(elt => elt.name === act.name);
                tmr.active = act.started_at;
                tmr.remaining_lines = tmr.lines - act.lines;
            }

            Timers.sort(sortByNameDEC);
        });
}
function updateTimerTable() {
    let options = {
        headers: ['name', 'output', 'interval', 'active'],
        header_translation: { 'by': 'added_by' },
        content_translation: {
            output: (x, obj, i, content) => {
                let s = '';
                if (!content.trim())
                    if (!obj.description || show_output_only)
                        if (hightlight_vars && obj.output) s += createVariableDivs(extractVariables(obj.output), obj.output);
                        else if (obj.alias) {
                            s += '<span ' + (!Commands.find(elt => obj.alias.split(' ')[0] === elt.name) && !HCCommands.find(elt => obj.alias.split(' ')[0] === elt.name) ? 'notfound title="Alias Command not found!"' : '') + '>';
                            s += "Alias: " + obj.alias;
                            s += '</span>';
                        }
                        else s += obj.output;
                    else s += obj.description;
                return s;
            },
            active: (x, obj, i, content) => {
                if (!x) return '-';
                return MISC_createTable_timestamps(x, 'relative') + ' and ' + Math.max(0, obj.remaining_lines) + ' Lines';
            }
        },
        column_addition: {
            settings: (x) => {
                let btns = "";

                if (x.active) btns += '<button red onclick="stop_timer(\'' + x.name + '\')">stop</button>';
                else btns += '<button green onclick="start_timer(\'' + x.name + '\')">start</button>';

                btns += '<button yellow onclick="edit_timer(\'' + x.name + '\')">edit</button>';
                btns += '<button red onclick="remove_timer(\'' + x.name + '\')">remove</button>';
                
                return btns;
            }
        }
    };
    if (AUTH_MODE) options.headers.push('by', 'settings');

    let arr = Timers.slice(Timers_perPage * Timers_currentPage, Timers_perPage * (Timers_currentPage + 1));
    document.getElementById('TIMER_LIST').innerHTML = MISC_createTable(arr, options);

    updateTimersUI();
}

//UI
function Timers_perPageChange(x) {
    if (x.value === 'ALL') Timers_perPage = Timers.length;
    else Timers_perPage = x.value;

    if (Timers_currentPage >= Math.ceil(Timers.length / Timers_perPage)) {
        Timers_lastPage();
        return;
    }

    updateTimerTable();
}
function Timers_pageChange(x, e) {
    if (e.inputType.startsWith('delete')) return;

    if (x.value < x.min) x.value = x.min;
    else if (x.value > x.max) x.value = x.max;

    Commands_currentPage = x.value - 1;

    updateCommandsTable();
}
function Timers_firstPage() {
    if (Commands_currentPage === 0) return;

    Commands_currentPage = 0;
    updateCommandsTable();
}
function Timers_nextPage() {
    Commands_currentPage++;

    if (Commands_currentPage >= Math.ceil(Commands.length / Commands_perPage)) {
        Commands_lastPage();
        return;
    }

    updateCommandsTable();
}
function Timers_prevPage() {
    Commands_currentPage--;
    if (Commands_currentPage < 0) {
        Commands_firstPage();
        return;
    }

    updateCommandsTable();
}
function Timers_lastPage() {
    if (Commands_currentPage === Math.ceil(Commands.length / Commands_perPage) - 1) return;
    Commands_currentPage = Math.ceil(Commands.length / Commands_perPage) - 1;
    updateCommandsTable();
}

function updateTimersUI() {
    let elt = document.getElementById('TMR_UI_PAGES');

    let first = elt.childNodes[1];
    let prev = elt.childNodes[3];
    let current = elt.childNodes[5];
    let next = elt.childNodes[7];
    let last = elt.childNodes[9];

    //First + Prev
    if (Timers_currentPage === 0) {
        prev.disabled = true;
        first.disabled = true;
    } else {
        prev.disabled = false;
        first.disabled = false;
    }

    //Current
    current.value = Timers_currentPage + 1;
    current.max = Math.ceil(Timers.length / Timers_perPage);
    current.title = (Timers_currentPage + 1) + "/" + Math.ceil(Timers.length / Timers_perPage);

    //Last + Next
    if (Timers_currentPage + 1 === Math.ceil(Timers.length / Timers_perPage)) {
        next.disabled = true;
        last.disabled = true;
    } else {
        next.disabled = false;
        last.disabled = false;
    }
}

//EDITOR
function editor_Timer_show(hide = false) {
    if (hide) {
        document.getElementById('MAIN_CONTENT_WRAPPER').classList.remove('blur');
        document.getElementById('TIMER_EDITOR').classList.remove('show');
        editor_Timer_setData({ enabled: true, interval: "5m" });
        EDIT_MODE = 0;
    }
    else {
        document.getElementById('MAIN_CONTENT_WRAPPER').classList.add('blur');
        document.getElementById('TIMER_EDITOR').classList.add('show');
    }
}
function editor_Timer_setData(data = {}) {
    let name = document.getElementById('EDITOR_TIMER_NAME');
    let output = document.getElementById('EDITOR_TIMER_OUTPUT');
    let description = document.getElementById('EDITOR_TIMER_DESC');
    let interval = document.getElementById('Editor_TIMER_INTERVAL_Text');
    let enabled = document.getElementById('EDITOR_TIMER_ENABLE');
    let viewing_restriction = document.getElementById('EDITOR_TIMER_VIEWING_RESTRICTION');
    let alias = document.getElementById('EDITOR_TIMER_ALIAS');
    let alias_info = document.getElementById('EDITOR_TIMER_ALIAS_INFO');
    let game = document.getElementById('EDITOR_TIMER_AUTO_ENABLE_IN');
    
    name.value = data.name || '';
    name.placeholder = name.value;

    output.value = data.output || '';
    description.value = data.description || '';
    interval.value = data.interval;
    editor_Timer_interval_reverse(data.interval);
    interval.value = data.interval;
    editor_Timer_lines_change(data.lines);
    SWITCHBUTTON_TOGGLE(enabled, data.enabled === true);
    SWITCHBUTTON_TOGGLE(viewing_restriction, data.viewing_restriction === true);
    alias.value = data.alias || '';

    let alias_text = alias.value.split(' ')[0];

    if (alias_text && !Commands.find(elt => elt.name === alias_text) && !HCCommands.find(elt => elt.name === alias_text)) {
        alias.classList.add("notfound");
        alias_info.innerHTML = 'Alias Command not found!';
    } else {
        alias.classList.remove("notfound");
        alias_info.innerHTML = '';
    }

    let auto_enable = 0;
    TIMER_AUTO_ENABLE.find((elt, idx) => {
        if (elt === data.auto_enable) {
            auto_enable = idx;
            return true;
        }
        return false;
    });

    document.getElementById('EDITOR_TIMER_AUTO_ENABLE_WRAPPER').innerHTML = '<span>Auto-Enable</span>' + MISC_SELECT_create(TIMER_AUTO_ENABLE, auto_enable, "EDITOR_TIMER_AUTO_ENABLE", 'editor_Timer_auto_enable(this)');
    game.value = data.game || '';
    editor_Timer_auto_enable();
}

function editor_Timer_output_change(elt, e) {
    if (e.inputType === 'insertLineBreak') elt.value = elt.value.substring(0, elt.value.length - 1);
    if (!hightlight_vars) return;

    else if (extractVariables(elt.value).length > 0) document.getElementById('EDITOR_TIMER_OUT_VARS').innerHTML = createVariableDivs(extractVariables(elt.value), elt.value);
    else document.getElementById('EDITOR_TIMER_OUT_VARS').innerHTML = "";

    if (document.getElementById('EDITOR_TIMER_OUT_VARS').innerHTML == "") document.getElementById('EDITOR_TIMER_OUT_VARS').style.display = "none";
    else document.getElementById('EDITOR_TIMER_OUT_VARS').style.display = "inline-block";
}
function editor_Timer_interval_change(elt) {
    let s = "5min";
    let number = parseInt(elt.value);

    if (number < 26) s = (number + 4) + "m";
    else s = ((number - 20) * 5) + "m";

    document.getElementById('Editor_TIMER_INTERVAL_Text').value = s;
}
function editor_Timer_interval_reverse(cooldownStr) {
    let s = 0;
    let min = parseCooldownString(cooldownStr) / 1000 / 60;

    if (min < 30) s = min - 5;
    else s = min / 5 + 20;

    document.getElementById('EDITOR_TIMER_INTERVAL').value = s;
}
function editor_Timer_lines_change(value = 10) {
    let slider = document.getElementById('EDITOR_TIMER_LINES');
    let text = document.getElementById('Editor_TIMER_LINES_Text');

    slider.value = value;
    text.value = value;
}
function editor_Timer_alias(elt) {
    let alias = elt.value.split(' ')[0];
    let alias_info = document.getElementById('EDITOR_TIMER_ALIAS_INFO');

    if (!Commands.find(elt => elt.name === alias) && !HCCommands.find(elt => elt.name === alias)) {
        elt.classList.add("notfound");
        alias_info.innerHTML = 'Alias Command not found!';
    } else {
        elt.classList.remove("notfound");
        alias_info.innerHTML = '';
    }
}
function editor_Timer_auto_enable(elt) {
    if (MISC_SELECT_GetValue(document.getElementById('EDITOR_TIMER_AUTO_ENABLE')) === 'game') {
        document.getElementById('EDITOR_TIMER_AUTO_ENABLE_IN').removeAttribute('hidden');
    } else {
        document.getElementById('EDITOR_TIMER_AUTO_ENABLE_IN').setAttribute('hidden', 'true');
    }
}

function editor_Timer_gerneratoreJSON() {
    let name = document.getElementById('EDITOR_TIMER_NAME').value;
    let output = document.getElementById('EDITOR_TIMER_OUTPUT').value;
    let description = document.getElementById('EDITOR_TIMER_DESC').value;
    let interval = document.getElementById('Editor_TIMER_INTERVAL_Text').value;
    let enabled = document.getElementById('EDITOR_TIMER_ENABLE').value === true;
    let alias = document.getElementById('EDITOR_TIMER_ALIAS').value;
    let lines = parseInt(document.getElementById('EDITOR_TIMER_LINES').value);
    let viewing_restriction = document.getElementById('EDITOR_TIMER_VIEWING_RESTRICTION').value === true;
    let auto_enable = MISC_SELECT_GetValue(document.getElementById('EDITOR_TIMER_AUTO_ENABLE'));
    let game = document.getElementById('EDITOR_TIMER_AUTO_ENABLE_IN').value;

    if (auto_enable === 'game' && game === "") {
        OUTPUT_showError('Please enter a game :)', document.getElementById('EDITOR_OUTPUT_2'));
        return null;
    }

    let data = { name, output, description, enabled, interval, alias, lines, viewing_restriction, auto_enable, game };
    
    for (let key in data) {
        if (data[key] === "") delete data[key];
    }

    return data;
}
function editor_Timer_gerneratoreHash() {
    let s = "editor=timer";
    let tmr = editor_Timer_gerneratoreJSON();

    for (let key in tmr) {
        s += "&" + key + "=" + encodeURIComponent(tmr[key]);
    }

    return s;
}

function editor_Timer_save() {
    if (EDIT_MODE === 0) addTimer();
    else if (EDIT_MODE === 1) send_edit_Timer();
}

async function addTimer() {
    let data = editor_Timer_gerneratoreJSON();

    if (!data) return;

    let s = validate(data, TIMER_TEMPLATE, TIMER_TEMPLATE_REQUIRED);
    if (typeof (s) == "string") {
        OUTPUT_showError(s, document.getElementById('EDITOR_OUTPUT_2'));
        return Promise.resolve();
    }

    let opts = getAuthHeader();
    opts['method'] = 'POST';
    opts['headers']['Content-Type'] = 'application/json';
    opts['body'] = JSON.stringify({ timer: data });

    fetch('/api/commands/timers', opts)
        .then(STANDARD_FETCH_RESPONSE_CHECKER)
        .then(json => {
            OUTPUT_showInfo("Timer added!");
            editor_Timer_show(true);

            if (data.enabled === true) data.active = Date.now() + parseCooldownString(data.interval);
            data.added_by = LOGIN_getUsername();

            //Update Table
            Timers.push(data);
            Timers.sort(sortByNameDEC);
            updateTimerTable();
        })
        .catch(err => {
            console.log(err);
            OUTPUT_showError(err.message, document.getElementById('EDITOR_OUTPUT_2'));
        });
}
function edit_timer(name) {
    let timer = Timers.find(elt => elt.name === name);
    if (timer) {
        EDIT_MODE = 1;
        editor_Timer_setData(timer);
        editor_Timer_show();
    }
}
async function send_edit_Timer() {
    let data = editor_Timer_gerneratoreJSON();

    if (!data) return;

    //Validate Data
    let s = validate(data, TIMER_TEMPLATE, TIMER_TEMPLATE_REQUIRED);
    if (typeof (s) == "string") {
        OUTPUT_showError(s, document.getElementById('EDITOR_OUTPUT_2'));
        return Promise.resolve();
    }

    //Change name?
    let oldname = document.getElementById('EDITOR_TIMER_NAME').placeholder;

    if (oldname !== data.name && Timers.find(elt => elt.name === oldname)) {
        let success = false;
        let opts = getAuthHeader();
        opts['method'] = 'MOVE';
        opts['headers']['Content-Type'] = 'application/json';
        opts['body'] = JSON.stringify({ newname: data.name, oldname });

        await fetch('/api/commands/timers', opts)
            .then(STANDARD_FETCH_RESPONSE_CHECKER)
            .then(json => {
                let idx = -1;
                Timers.find((elt, index) => {
                    if (elt.name === oldname) {
                        idx = index;
                        return true;
                    }

                    return false;
                });
                if (idx >= 0) {
                    Timers[idx].name = data.name;
                    Timers[idx].added_by = LOGIN_getUsername();
                    Timers.sort(sortByNameDEC);
                    updateTimerTable();
                    success = true;
                } else {
                    OUTPUT_showError("Timer not found!", document.getElementById('EDITOR_OUTPUT_2'));
                }
            })
            .catch(err => {
                console.log(err);
                OUTPUT_showError(err.message, document.getElementById('EDITOR_OUTPUT_2'));
            });

        if (!success) return;
    }

    //Change Data
    let opts = getAuthHeader();
    opts['method'] = 'PUT';
    opts['headers']['Content-Type'] = 'application/json';
    opts['body'] = JSON.stringify({ timer: data });

    await fetch('/api/commands/timers', opts)
        .then(STANDARD_FETCH_RESPONSE_CHECKER)
        .then(json => {
            //Update Table
            let idx = -1;
            Timers.find((elt, index) => {
                if (elt.name === data.name) {
                    idx = index;
                    return true;
                }

                return false;
            });
            
            if (data.enabled === true) data.active = Date.now() + parseCooldownString(data.interval);
            if (idx >= 0 && Timers[idx].enabled === true) data.active = Timers[idx].active;
            if (idx >= 0) Timers.splice(idx, 1, data);
            data.added_by = LOGIN_getUsername();

            Timers.sort(sortByNameDEC);
            updateTimerTable();

            OUTPUT_showInfo("Timer changed!");
            editor_Timer_show(true);
        })
        .catch(err => {
            console.log(err);
            OUTPUT_showError(err.message, document.getElementById('EDITOR_OUTPUT_2'));
        });
}
async function remove_timer(name) {
    //Await Confirmation
    let answer = 'NO';

    document.getElementById('CUSTOM_COMMAND_EDITOR').style.display = 'none';
    document.getElementById('TIMER_EDITOR').style.display = 'none';

    try {
        answer = await MISC_USERCONFIRM("YOU SURE YOU WANT THIS?", "Do you really want to delete this Timer?");
    } catch (err) {

    }

    document.getElementById('CUSTOM_COMMAND_EDITOR').style.display = null;
    document.getElementById('TIMER_EDITOR').style.display = null;
    
    if (answer !== 'YES') return Promise.resolve();

    let opts = getAuthHeader();
    opts['method'] = 'DELETE';
    opts['headers']['Content-Type'] = 'application/json';
    opts['body'] = JSON.stringify({ name });

    fetch('/api/Commands/timers', opts)
        .then(STANDARD_FETCH_RESPONSE_CHECKER)
        .then(json => {
            OUTPUT_showInfo("Timer removed!");

            //Update Table
            let idx = -1;
            Timers.find((elt, index) => {
                if (elt.name === name) {
                    idx = index;
                    return true;
                }

                return false;
            });
            if (idx >= 0) Timers.splice(idx, 1);
            Timers.sort(sortByNameDEC);
            updateTimerTable();
        })
        .catch(err => {
            console.log(err);
            OUTPUT_showError(err.message);
        });
}

async function start_timer(name) {
    let opts = getAuthHeader();
    opts['method'] = 'UNLOCK';
    opts['headers']['Content-Type'] = 'application/json';
    opts['body'] = JSON.stringify({ name });

    fetch('/api/Commands/timers', opts)
        .then(STANDARD_FETCH_RESPONSE_CHECKER)
        .then(json => {
            OUTPUT_showInfo("Timer started!");

            //Update Table
            let idx = -1;
            Timers.find((elt, index) => {
                if (elt.name === name) {
                    idx = index;
                    return true;
                }

                return false;
            });
            if (idx >= 0) {
                Timers[idx].active = Date.now() + parseCooldownString(Timers[idx].interval);
                Timers[idx].enabled = true;
            }

            Timers.sort(sortByNameDEC);
            updateTimerTable();
        })
        .catch(err => {
            console.log(err);
            OUTPUT_showError(err.message);
        });
}
async function stop_timer(name) {
    let opts = getAuthHeader();
    opts['method'] = 'LOCK';
    opts['headers']['Content-Type'] = 'application/json';
    opts['body'] = JSON.stringify({ name });

    fetch('/api/Commands/timers', opts)
        .then(STANDARD_FETCH_RESPONSE_CHECKER)
        .then(json => {
            OUTPUT_showInfo("Timer stopped!");

            //Update Table
            let idx = -1;
            Timers.find((elt, index) => {
                if (elt.name === name) {
                    idx = index;
                    return true;
                }

                return false;
            });
            if (idx >= 0) {
                delete Timers[idx].active;
                Timers[idx].enabled = false;
            }

            Timers.sort(sortByNameDEC);
            updateTimerTable();
        })
        .catch(err => {
            console.log(err);
            OUTPUT_showError(err.message);
        });
}

/*-----------------------------
            UTIL
-----------------------------*/

function extractVariables(commandOutString, addStart = 0) {
    let variables = [];
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
                //throw new Error("Command Grammar ERROR: Probably missing ( or )!");
                return [];
            }
        }

        let vari = commandOutString.substring(start - 2, tempStart);

        variables.push({
            var: vari,
            start: addStart + start,
            end: addStart + tempStart,
            name: vari.substring(2, vari.indexOf(')') < vari.indexOf(' ') || vari.indexOf(' ') === -1 ? vari.indexOf(')') : vari.indexOf(' '))
        });
        start = tempStart;
    }

    if (variables.length > 0) {
        let temp = [];
        for (let vari of variables) {
            temp.push(extractVariables(vari.var.substring(2, vari.var.length - 1), vari.start));
        }
        variables.push(temp);
    }

    return variables;
}
function createVariableDivs(stackedVariables, original, start = 0, level = 0, parentEnd) {
    let color = ["252, 186, 3", "252, 3, 156"];
    let returned = "";
    
    for (let i = 0; i < stackedVariables.length - 1; i++) {
        let is_missing = false;

        let vars = CommandVariables.find(elt => elt.name.toLowerCase() === stackedVariables[i].name);
        if (vars) {
            for (let vari of vars.details.api_requierements || []) {
                if (stackedVariables[i].name.toLowerCase() === 'twitch') {
                    for (let key in vari) {
                        if (stackedVariables[i].var.split(" ")[2].split(')')[0] === key) {
                            if (!SCOPES.find(elt => elt === vari[key])) is_missing = true;
                            break;
                        }
                    }
                }
            }
        }

        //ADD BEFORE
        if (i == 0) {
            returned += original.substring(start, stackedVariables[i].start - 2);
        }

        let title = 'VARIABLE';
        if (is_missing) title += ' - Missing API Scope Access!';
        
        //ADD VARIABLE
        if (stackedVariables[stackedVariables.length - 1][i].length == 0) {
            let content = stackedVariables[i].var;

            if (fill_output) {
                let cur_obj = CustomVariables;

                for (let step of stackedVariables[i].name.split('.')) {
                    cur_obj = cur_obj[step];
                    if (cur_obj === undefined) break;
                }

                if (cur_obj !== undefined && typeof cur_obj !== 'object') content = cur_obj;
            }

            //Directly Add Variable
            returned += '<span title="' + title + '" style="background-color: rgba(' + color[level % color.length] + ', 0.1); border: 1px solid rgb(' + color[level % color.length] + '); ' + (is_missing ? "color: red;" : 'color: var(--table-color);') + '">' + content + '</span>';
        } else {
            //Wrapping 
            returned += '<span title="' + title + '" style="background-color: rgba(' + color[level % color.length] + ', 0.1); border: 1px solid rgb(' + color[level % color.length] + '); ' + (is_missing ? "color: red;" : 'color: var(--table-color);') + '">' + createVariableDivs(stackedVariables[stackedVariables.length - 1][i], original, stackedVariables[i].start - 2, level + 1, stackedVariables[i].end) + '</span>';
        }
        start = stackedVariables[i].end;

        //ADD AFTER
        if (i <= stackedVariables.length - 2) {
            //has Parent
            if (parentEnd) {
                returned += original.substring(start, parentEnd);
            } else {
                //is Parent
                //has another parent
                if (stackedVariables[i + 1].start) {
                    returned += original.substring(start, stackedVariables[i + 1].start - 2);
                } else {
                    //is last
                    returned += original.substring(start);
                }
            }
        }
    }

    return returned ? returned : original;
}
function parseCooldownString(cooldownString) {
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

function sortByNameDEC(a, b) {
    let temp = [a.name, b.name];

    temp.sort();

    if (temp[0] == a.name) {
        return -1;
    } else {
        return 1;
    }
}
function sortByNameACC(a, b) {
    let temp = [a.name, b.name];

    temp.sort();

    if (temp[0] == a.name) {
        return 1;
    } else {
        return -1;
    }
}

function validate(data, TEMPLATE, REQUIERED) {
    let s = validateName(data.name);
    if (typeof (s) == "string") return s;

    for (let template in REQUIERED) {
        if (data[template] == null && template === 'output' && (data.alias === undefined || data.alias === "")) {
            return "Missing " + template + "!";
        } else if (template !== 'output' && typeof (data[template]) != TEMPLATE[template]) {
            return template + " is not a " + TEMPLATE[template] + "!";
        }
    }

    for (let key in data) {
        if (TEMPLATE[key] == undefined) {
            return key + " is not a valid Attribute!";
        } else if (typeof (data[key]) != TEMPLATE[key]) {
            return key + " is not a " + TEMPLATE[key] + "!";
        } else if (TEMPLATE[key] == "string" && data[key].trim() == "" && key != "description") {
            return key + " is empty!";
        }
    }

    return true;
}
function validateName(name) {
    if (!name) {
        return "No Name found!";
    } else if (typeof name !== "string") {
        return "Name is not a string!";
    } else if (name.indexOf(" ") >= 0) {
        return "Unsupported Characters found!";
    }

    return true;
}