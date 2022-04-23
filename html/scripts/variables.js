let CUSTOM_VARIABLES = {};
let changes = false;

function init() {
    OUTPUT_create();
    updateVariables();
    fetchCustomVariables();
}

//Standard Variables
function updateVariables() {
    fetch("/api/Commands/variables", getAuthHeader())
        .then(STANDARD_FETCH_RESPONSE_CHECKER)
        .then(json => {
            let s = '';
            
            let i = 0;
            for (let vari in json.variables) {
                s += createVariable(vari, json.variables[vari], i++);
            }

            document.getElementById('VARIABLE_LIST').innerHTML = s;
        })
        .catch(err => {
            console.log(err);
            OUTPUT_showError(err);
        });
}

function createVariable(name, variable, index) {
    let s = '';

    s += '<div class="variable ' + (variable.enabled === false ? 'disabled' : '') + '"><span> &#8226; ';
    s += '<variable>' + name + '</variable> - ' + (variable.details.Nightbot ? 'Nightbot ' + (variable.details.Nightbot.enhanced ? '*' : '') + ' <img src="icons/Nightbot.png">' : 'FrikyBot <img src="../images/icons/FrikyBot_Colored.png">');
    s += ' [<CLICK onclick="expand(' + (index++) + ')">show more</CLICK>]</span>';
    s += '<div class="expanded" hidden>' + (variable.details.FrikyBot ? createDescription(variable.details.description) : (variable.details.Nightbot ? createNightbot(name, variable) : "DESCRIPTION NOT AVAILABLE")) + "</div></div>";
    
    return s;
}
function createNightbot(name, data) {
    return data.details.description + "<br> <b>This Variable is based on a Nighbot reference! Last Update on " + data.details.Nightbot.version + '</b> [<a href="https://docs.nightbot.tv/variables/' + name.toLowerCase() + '" target=_blank>Nightbot Docs</a>]';
}
function createDescription(description) {
    return description;
}

function expand(idx) {
    if (!document.getElementsByClassName("expanded").length > idx || idx < 0)
        return;

    if (document.getElementsByClassName("expanded")[idx].hidden) {
        document.getElementsByClassName("expanded")[idx].hidden = false;
        document.getElementsByTagName("CLICK")[idx].innerHTML = "show less";
    } else{
        document.getElementsByClassName("expanded")[idx].hidden = true;
        document.getElementsByTagName("CLICK")[idx].innerHTML = "show more";
    }
}

//Custom Variables
function fetchCustomVariables() {
    fetch("/api/Commands/Variables/Custom", getAuthHeader())
        .then(STANDARD_FETCH_RESPONSE_CHECKER)
        .then(json => {
            CUSTOM_VARIABLES = json;
            updateCustomVariables();
            document.getElementById('CUSTOM_VARIABLE_CONTENT_WRAPPER').style.display = "block";
        })
        .catch(err => {

        });
}
function updateCustomVariables() {
    const opts = {
        add_dataset: (x, hdr) => hdr,
        add_event: {
            'onclick': 'event.stopPropagation(); highlight(this);',
            'onmouseout': 'event.stopPropagation(); mouseOut(this);',
            'onmouseover': 'event.stopPropagation(); mouseIn(this);'
        },
        allow_auto_rotation: true,
        vertical: 'first',
        disable_caps_headers: true
    };

    document.getElementById('CUSTOM_VARIABLE_CONTENT').innerHTML = MISC_createTable([JSON.parse(JSON.stringify(CUSTOM_VARIABLES))], opts);
}

function mouseIn(elt) {
    elt.classList.add('hover');
}
function mouseOut(elt) {
    elt.classList.remove('hover');
}

function highlight(elt) {
    let toggle = false;

    if (elt.classList.contains('highlighted')) {
        elt.classList.remove('highlighted');
        toggle = true;
    } else {
        for (let high of document.getElementsByClassName('highlighted')) {
            high.classList.remove('highlighted');
        }
        elt.classList.add('highlighted');
    }

    if (toggle) {
        document.getElementById('CUSTOM_REMOVE').disabled = true;
    } else {
        document.getElementById('CUSTOM_REMOVE').disabled = false;
    }


    document.getElementById('CUSTOM_PATH').value = generateCustomVariablesPath(elt);
    showCustomUI(true);
    document.getElementById('CUSTOM_SAVE').disabled = true;
    document.getElementById('CUSTOM_VARIABLE_CONTENT_UI').classList.remove('jsonerror');
}

function CV_input(elt) {
    elt.value = elt.value.trim();

    for (let high of document.getElementsByClassName('highlighted')) {
        high.classList.remove('highlighted');
    }

    showCustomUI(getObjectFromPath(CUSTOM_VARIABLES, elt.value) !== null);
    document.getElementById('CUSTOM_SAVE').disabled = true;
    document.getElementById('CUSTOM_REMOVE').disabled = getObjectFromPath(CUSTOM_VARIABLES, elt.value) !== null;
    document.getElementById('CUSTOM_VARIABLE_CONTENT_UI').classList.remove('jsonerror');
}
function CV_input_area(elt) {
    document.getElementById('CUSTOM_SAVE').disabled = false;
    document.getElementById('CUSTOM_REMOVE').disabled = true;
    document.getElementById('CUSTOM_CANCEL').disabled = false;
    document.getElementById('CUSTOM_PATH').disabled = true;
    document.getElementById('CUSTOM_VARIABLE_CONTENT_UI').classList.remove('jsonerror');
}
function CV_area() {
    let elt = document.getElementById('CUSTOM_AREA');
    let obj = getObjectFromPath(CUSTOM_VARIABLES, document.getElementById('CUSTOM_PATH').value);
    if (obj === null) {
        elt.style.height = '30px';
        elt.innerHTML = "";
        return;
    }

    elt.innerHTML = JSON.stringify(obj, null, 4);
    
    let px = elt.scrollHeight;
    if (px > 300) px = 300;
    elt.style.height = px + 'px';
}

function saveCustom() {
    let path = null;
    let data = null;

    try {
        path = document.getElementById('CUSTOM_PATH').value;
        data = JSON.parse(document.getElementById('CUSTOM_AREA').value);
    } catch (err) {
        OUTPUT_showError("JSON Parsing Error: You probably missed some \" s around names/texts!", document.getElementById('OUTPUT_2'));
        document.getElementById('CUSTOM_VARIABLE_CONTENT_UI').classList.add('jsonerror');
        return;
    }
    OUTPUT_hideError(document.getElementById('OUTPUT_2'));
    document.getElementById('CUSTOM_VARIABLE_CONTENT_UI').classList.remove('jsonerror');
    
    let opts = getAuthHeader();
    opts.method = 'PUT';
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify({ path, data });
    
    fetch("/api/Commands/variables/custom", opts)
        .then(STANDARD_FETCH_RESPONSE_CHECKER)
        .then(json => {
            setObjectAtPath(CUSTOM_VARIABLES, path, data);
            updateCustomVariables();

            document.getElementById('CUSTOM_PATH').value = "";
            document.getElementById('CUSTOM_PATH').disabled = false;
            document.getElementById('CUSTOM_SAVE').disabled = true;
            document.getElementById('CUSTOM_REMOVE').disabled = true;
            document.getElementById('CUSTOM_CANCEL').disabled = true;
            
            showCustomUI();
        })
        .catch(err => {
            OUTPUT_showError(err.message);
            console.log(err);
        });
}
function removeCustom() {
    let path = document.getElementById('CUSTOM_PATH').value;
    
    let opts = getAuthHeader();
    opts.method = 'DELETE';
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify({ path });

    fetch("/api/Commands/variables/custom", opts)
        .then(STANDARD_FETCH_RESPONSE_CHECKER)
        .then(json => {
            deleteObjectAtPath(CUSTOM_VARIABLES, path);
            updateCustomVariables();

            document.getElementById('CUSTOM_PATH').value = "";
            document.getElementById('CUSTOM_PATH').disabled = false;
            document.getElementById('CUSTOM_SAVE').disabled = true;
            document.getElementById('CUSTOM_REMOVE').disabled = true;
            document.getElementById('CUSTOM_CANCEL').disabled = true;

            showCustomUI();
        })
        .catch(err => {
            OUTPUT_showError(err.message);
            console.log(err);
        });
}
function cancelCustom() {
    document.getElementById('CUSTOM_SAVE').disabled = true;
    document.getElementById('CUSTOM_PATH').disabled = false;
    document.getElementById('CUSTOM_CANCEL').disabled = true;
    showCustomUI(getObjectFromPath(CUSTOM_VARIABLES, document.getElementById('CUSTOM_PATH').value) !== null);
}

function showCustomUI(value) {
    let s = '';
    if (value == true) s = '<textarea id="CUSTOM_AREA" oninput="CV_input_area(this)"></textarea>';
    else if (value == false) s = '<button onclick="CV_createPath()">create Path</button>';
    else s = '';
    document.getElementById('CUSTOM_DATA').innerHTML = s;

    if (value) CV_area();
}
function CV_createPath() {
    let path = document.getElementById('CUSTOM_PATH').value;
    let obj = CUSTOM_VARIABLES;
    let splitted = path.split('.');

    for (let i = 0; i < splitted.length; i++) {
        let split = splitted[i];
        if (obj[split] === undefined) obj[split] = {};
        obj = obj[split];
    }

    document.getElementById('CUSTOM_SAVE').disabled = false;
    document.getElementById('CUSTOM_CANCEL').disabled = false;
    document.getElementById('CUSTOM_PATH').disabled = true;
    showCustomUI(true);
}

function deleteObjectAtPath(obj, path) {
    try {
        let splitted_path = path.split('.').slice(0, path.split('.').length - 1);
        obj = getObjectFromPath(obj, splitted_path);
        delete obj[path.split('.')[path.split('.').length - 1]];
        return true;
    } catch (err) {
        return false;
    }
}
function setObjectAtPath(obj, path, value) {
    try {
        let splitted_path = path.split('.').slice(0, path.split('.').length - 1);
        obj = getObjectFromPath(obj, splitted_path);
        obj[path.split('.')[path.split('.').length - 1]] = value;
        return true;
    } catch (err) {
        return false;
    }
}
function getObjectFromPath(obj, path) {
    try {
        if (!(path instanceof Array)) path = path.split('.');
        if (path.length === 0) return obj;
        if (obj[path[0]] === undefined) return null;
        if (obj[path[0]] !== undefined) return getObjectFromPath(obj[path[0]], path.slice(1));
        else return obj;
    } catch (err) {
        return null;
    }
}
function generateCustomVariablesPath(elt) {
    let path = '';

    while (elt.parentElement.tagName !== 'BODY' && elt.parentElement.tagName !== 'CUSTOM_VARIABLE_CONTENT' && elt.parentElement.tagName !== 'CUSTOM_VARIABLE_CONTENT_UI_TABLE') {
        if (elt.dataset.custom) path = elt.dataset.custom + '.' + path;
        elt = elt.parentElement;
    }
    path = path.substring(0, path.length - 1);

    return path;
}